# Dhara Deposit Engine Implementation Plan (v1: Sessions → Coaching Prep)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saved coaching sessions deposit provenance-carrying signals into an append-only ledger via one `depositSignal()` interface; a cheap-model distiller (on-demand + cron sweep) curates them into `cp_coach_memory`; a confidence-gated, tap-to-source, dismissible coaching-prep card surfaces them before the next session; the deposit is felt the moment a session is saved.

**Architecture:** Pure logic (`lib/signals.ts`, `lib/llm.ts`, `lib/distill/session-distill.ts`, `lib/coaching-prep.ts`) is unit-tested and shared by two thin routes (user-authed on-demand distill + CRON_SECRET sweep) plus a push UI card. Session-save stays instant and dumb.

**Tech Stack:** Next.js App Router (edge), Supabase Postgres (`cp_signals` new, `cp_coach_memory` extended), OpenRouter via `lib/llm.ts`, Vitest, the `CRON_SECRET` cron pattern, `createAdminClient()` service-role.

**Planning refinement vs spec:** the spec described one cron route doing both on-demand (`?session_id`) and the sweep. Exposing a `CRON_SECRET` route to the browser is wrong; instead the on-demand path is a **user-authed** route (`POST /api/sessions/[id]/distill`) and the sweep is the `CRON_SECRET` route. Both call one shared runner (`lib/distill/run-session-distill.ts`). Same behavior, correct security boundary.

---

## File Structure
- `supabase/migrations/20260608_signal_ledger.sql` — `cp_signals` + RLS + indexes; extend `cp_coach_memory.source` CHECK.
- `lib/signals.ts` — `depositSignal()` write path + types (`SignalSource`, `SignalKind`, `NewSignal`).
- `lib/llm.ts` — OpenRouter per-task model call.
- `lib/distill/session-distill.ts` — pure: distill prompt + response parser (`text`+`evidence`) + signal mapping.
- `lib/distill/run-session-distill.ts` — impure runner: load session, call llm, deposit signals, mergeOrInsert memory.
- `app/api/sessions/[id]/distill/route.ts` — user-authed on-demand distill (called by the session page).
- `app/api/cron/distill-signals/route.ts` — CRON_SECRET sweep over un-distilled sessions.
- `app/api/signals/[id]/dismiss/route.ts` — user-authed dismiss (signal → dismissed, linked memory → forgotten).
- `lib/coaching-prep.ts` — `getCoachingPrep()` + confidence gating + types.
- `components/coaching/CoachingPrepCard.tsx` — push card: bullets, tap-to-source, dismiss, empty-state promise.
- `components/sessions/SessionDistillStatus.tsx` — felt-deposit ("adding to memory…" → "remembered N").
- `eval/distill/golden.jsonl`, `scripts/eval-distill.mjs`, `docs/qa/distill-eval.md`.

---

### Task 1: Migration — signal ledger + memory source extension

**Files:**
- Create: `supabase/migrations/20260608_signal_ledger.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Append-only signal ledger. Every feature deposits here via lib/signals.ts.
create table if not exists public.cp_signals (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references auth.users(id) on delete cascade,
  source      text not null check (source in ('session','voice','brand_os','lead','trust')),
  kind        text not null check (kind in ('topic','commitment','pattern','somatic','goal','note')),
  ref_table   text not null,
  ref_id      uuid,
  subject_id  uuid,
  text        text not null,
  evidence    text,
  confidence  text not null default 'candidate' check (confidence in ('candidate','repeated','confirmed')),
  weight      real not null default 1,
  status      text not null default 'active' check (status in ('active','dismissed')),
  created_at  timestamptz not null default now()
);

alter table public.cp_signals enable row level security;
drop policy if exists "coach owns signals" on public.cp_signals;
create policy "coach owns signals" on public.cp_signals
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

create index if not exists cp_signals_brief on public.cp_signals (coach_id, subject_id, status, created_at desc);
create index if not exists cp_signals_distilled on public.cp_signals (coach_id, source, ref_id);

-- Allow distilled session facts to live in cp_coach_memory.
alter table public.cp_coach_memory drop constraint if exists cp_coach_memory_source_check;
alter table public.cp_coach_memory add constraint cp_coach_memory_source_check
  check (source in ('conversation','explicit','brand_os','session'));
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply with the `apply_migration` MCP tool (project `modepuhwinzdngirlnkz`, name `signal_ledger`). Then verify with `execute_sql`:
```sql
select relrowsecurity from pg_class where relname = 'cp_signals';
select consrc is not null or pg_get_constraintdef(oid) like '%session%' as ok
from pg_constraint where conname = 'cp_coach_memory_source_check';
```
Expected: `relrowsecurity = true`; the memory CHECK includes `'session'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260608_signal_ledger.sql
git commit -m "feat(signals): cp_signals ledger + RLS + cp_coach_memory source extension"
```

---

### Task 2: `lib/signals.ts` — the one write path

**Files:**
- Create: `lib/signals.ts`
- Test: `lib/__tests__/signals.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/signals.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildSignalRow, SIGNAL_KINDS, type NewSignal } from "@/lib/signals";

describe("buildSignalRow", () => {
  const base: NewSignal = {
    source: "session", kind: "commitment", refTable: "cp_coaching_sessions",
    refId: "11111111-1111-1111-1111-111111111111", subjectId: "22222222-2222-2222-2222-222222222222",
    text: "Practice the morning breath drill daily", evidence: "I'll do the breath thing every morning",
  };

  it("stamps coach_id and defaults", () => {
    const row = buildSignalRow("coach-1", base);
    expect(row.coach_id).toBe("coach-1");
    expect(row.status).toBe("active");
    expect(row.confidence).toBe("candidate");
    expect(row.weight).toBe(1);
    expect(row.text).toBe(base.text);
    expect(row.evidence).toBe(base.evidence);
  });

  it("rejects an unknown kind", () => {
    expect(() => buildSignalRow("c", { ...base, kind: "bogus" as NewSignal["kind"] })).toThrow();
  });

  it("trims text and tolerates missing evidence/subject", () => {
    const row = buildSignalRow("c", { ...base, text: "  x  ", evidence: undefined, subjectId: undefined });
    expect(row.text).toBe("x");
    expect(row.evidence).toBeNull();
    expect(row.subject_id).toBeNull();
  });

  it("SIGNAL_KINDS is the canonical list", () => {
    expect(SIGNAL_KINDS).toContain("commitment");
    expect(SIGNAL_KINDS).toContain("pattern");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/signals.test.ts`
Expected: FAIL — cannot find module `@/lib/signals`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/signals.ts
//
// The ONE write path into cp_signals. Every source (sessions today; voice,
// brand_os, lead, trust later) deposits through depositSignal() so the ledger
// is not shaped around any single source. buildSignalRow is the pure shaper
// (unit-tested); depositSignal does the insert.

import type { SupabaseClient } from "@supabase/supabase-js";

export type SignalSource = "session" | "voice" | "brand_os" | "lead" | "trust";
export type SignalKind = "topic" | "commitment" | "pattern" | "somatic" | "goal" | "note";

export const SIGNAL_KINDS: SignalKind[] = ["topic", "commitment", "pattern", "somatic", "goal", "note"];

export type NewSignal = {
  source: SignalSource;
  kind: SignalKind;
  refTable: string;
  refId?: string | null;
  subjectId?: string | null;
  text: string;
  evidence?: string | null;
  weight?: number;
};

export type SignalRow = {
  coach_id: string;
  source: SignalSource;
  kind: SignalKind;
  ref_table: string;
  ref_id: string | null;
  subject_id: string | null;
  text: string;
  evidence: string | null;
  confidence: "candidate";
  weight: number;
  status: "active";
};

export function buildSignalRow(coachId: string, s: NewSignal): SignalRow {
  if (!SIGNAL_KINDS.includes(s.kind)) throw new Error(`Unknown signal kind: ${s.kind}`);
  const text = (s.text ?? "").trim();
  if (!text) throw new Error("Signal text is required");
  return {
    coach_id: coachId,
    source: s.source,
    kind: s.kind,
    ref_table: s.refTable,
    ref_id: s.refId ?? null,
    subject_id: s.subjectId ?? null,
    text,
    evidence: (s.evidence ?? "").trim() || null,
    confidence: "candidate",
    weight: s.weight ?? 1,
    status: "active",
  };
}

/** Insert one signal. The only place app code writes cp_signals. */
export async function depositSignal(
  client: SupabaseClient,
  coachId: string,
  signal: NewSignal,
): Promise<{ error: string | null }> {
  const { error } = await client.from("cp_signals").insert(buildSignalRow(coachId, signal));
  return { error: error?.message ?? null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/signals.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/signals.ts lib/__tests__/signals.test.ts
git commit -m "feat(signals): depositSignal() write path + buildSignalRow"
```

---

### Task 3: `lib/llm.ts` — OpenRouter per-task model

**Files:**
- Create: `lib/llm.ts`
- Test: `lib/llm/__tests__/llm.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/llm/__tests__/llm.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/llm/__tests__/llm.test.ts`
Expected: FAIL — cannot find module `@/lib/llm`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/llm.ts
//
// One OpenAI-compatible call via OpenRouter, with per-task model selection.
// Lets us run cheap models (Gemini Flash / DeepSeek) for distill + chat while
// keeping a strong model for voice-fidelity drafting — swappable by env.

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/llm/__tests__/llm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/llm.ts lib/llm/__tests__/llm.test.ts
git commit -m "feat(llm): OpenRouter per-task model abstraction"
```

---

### Task 4: `lib/distill/session-distill.ts` — pure distill contract + parser

**Files:**
- Create: `lib/distill/session-distill.ts`
- Test: `lib/distill/__tests__/session-distill.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/distill/__tests__/session-distill.test.ts
import { describe, it, expect } from "vitest";
import { buildDistillPrompt, parseDistillResponse, toSignals } from "@/lib/distill/session-distill";

describe("buildDistillPrompt", () => {
  it("forbids invention + em-dashes and demands evidence + JSON", () => {
    const p = buildDistillPrompt("client said they keep skipping mornings");
    expect(p.toLowerCase()).toContain("do not invent");
    expect(p.toLowerCase()).toContain("evidence");
    expect(p.toLowerCase()).toContain("em-dash");
    expect(p).toContain('"commitments"');
  });
});

describe("parseDistillResponse", () => {
  it("parses clean + fenced JSON into buckets of {text, evidence}", () => {
    const raw = '```json\n{"topics":[{"text":"mornings","evidence":"skipping mornings"}],"commitments":[],"patterns":[],"somatic":[]}\n```';
    const r = parseDistillResponse(raw);
    expect(r.topics[0]).toEqual({ text: "mornings", evidence: "skipping mornings" });
  });
  it("returns empty buckets on garbage", () => {
    const r = parseDistillResponse("not json");
    expect(r).toEqual({ topics: [], commitments: [], patterns: [], somatic: [] });
  });
  it("drops items with empty text", () => {
    const r = parseDistillResponse('{"topics":[{"text":"","evidence":"x"},{"text":"ok"}],"commitments":[],"patterns":[],"somatic":[]}');
    expect(r.topics).toEqual([{ text: "ok", evidence: null }]);
  });
});

describe("toSignals", () => {
  it("maps buckets to NewSignal[] with the right kinds + refs", () => {
    const parsed = { topics: [{ text: "t", evidence: "te" }], commitments: [{ text: "c", evidence: null }], patterns: [], somatic: [] };
    const sigs = toSignals(parsed, { sessionId: "s1", subjectId: "lead1" });
    expect(sigs).toEqual([
      { source: "session", kind: "topic", refTable: "cp_coaching_sessions", refId: "s1", subjectId: "lead1", text: "t", evidence: "te" },
      { source: "session", kind: "commitment", refTable: "cp_coaching_sessions", refId: "s1", subjectId: "lead1", text: "c", evidence: null },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/distill/__tests__/session-distill.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/distill/session-distill.ts
//
// Pure distillation of a coaching session into structured, provenance-carrying
// signals. The prompt is the product: extract only what's in the notes, quote
// the source as `evidence`, never invent.

import { extractJson } from "@/lib/voice/extract-rules";
import type { NewSignal, SignalKind } from "@/lib/signals";

export type DistillItem = { text: string; evidence: string | null };
export type DistillParsed = { topics: DistillItem[]; commitments: DistillItem[]; patterns: DistillItem[]; somatic: DistillItem[] };

export function buildDistillPrompt(sessionText: string): string {
  return [
    "You distill a coach's session notes into structured memory.",
    "Extract ONLY what is present in the notes. Do not invent facts, names,",
    "numbers, or outcomes. For every item include `evidence`: the exact phrase",
    "from the notes it came from. No em-dashes.",
    "",
    "Output strict JSON only:",
    '{ "topics": [{ "text": "", "evidence": "" }], "commitments": [...], "patterns": [...], "somatic": [...] }',
    "- topics: what the session was about (3-6, short).",
    "- commitments: things the client said they will do (quote the promise).",
    "- patterns: recurring themes worth watching (only if clearly recurring).",
    "- somatic: body/nervous-system observations, if any.",
    "Return empty arrays for buckets with nothing real.",
    "",
    "SESSION NOTES:",
    '"""',
    sessionText,
    '"""',
  ].join("\n");
}

function cleanBucket(v: unknown): DistillItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((it) => {
      const text = typeof it?.text === "string" ? it.text.trim() : "";
      const ev = typeof it?.evidence === "string" && it.evidence.trim() ? it.evidence.trim() : null;
      return { text, evidence: ev };
    })
    .filter((it) => it.text.length > 0);
}

export function parseDistillResponse(raw: string): DistillParsed {
  const json = extractJson(raw);
  let data: Record<string, unknown> = {};
  if (json) { try { data = JSON.parse(json); } catch { data = {}; } }
  return {
    topics: cleanBucket(data.topics),
    commitments: cleanBucket(data.commitments),
    patterns: cleanBucket(data.patterns),
    somatic: cleanBucket(data.somatic),
  };
}

const BUCKET_KIND: Array<[keyof DistillParsed, SignalKind]> = [
  ["topics", "topic"], ["commitments", "commitment"], ["patterns", "pattern"], ["somatic", "somatic"],
];

export function toSignals(parsed: DistillParsed, ctx: { sessionId: string; subjectId: string | null }): NewSignal[] {
  const out: NewSignal[] = [];
  for (const [bucket, kind] of BUCKET_KIND) {
    for (const item of parsed[bucket]) {
      out.push({
        source: "session", kind, refTable: "cp_coaching_sessions",
        refId: ctx.sessionId, subjectId: ctx.subjectId, text: item.text, evidence: item.evidence,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/distill/__tests__/session-distill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/distill/session-distill.ts lib/distill/__tests__/session-distill.test.ts
git commit -m "feat(distill): pure session distill contract + parser + signal mapping"
```

---

### Task 5: `lib/distill/run-session-distill.ts` — shared runner

**Files:**
- Create: `lib/distill/run-session-distill.ts`

- [ ] **Step 1: Write the runner**

```ts
// lib/distill/run-session-distill.ts
//
// Impure runner shared by the on-demand route and the cron sweep. Loads a
// session, distills it (cheap model), deposits signals, and upserts durable
// facts into cp_coach_memory. Idempotent: skips a session already distilled.

import type { SupabaseClient } from "@supabase/supabase-js";
import { callLLM } from "@/lib/llm";
import { buildDistillPrompt, parseDistillResponse, toSignals } from "@/lib/distill/session-distill";
import { depositSignal } from "@/lib/signals";
import { mergeOrInsert, normalizeMemoryText, type CoachMemory, type MemoryKind } from "@/lib/dhara/memory";

export type DistillResult = { sessionId: string; deposited: number; skipped: boolean; error?: string };

export async function runSessionDistill(admin: SupabaseClient, sessionId: string): Promise<DistillResult> {
  const { data: session } = await admin
    .from("cp_coaching_sessions")
    .select("id, coach_id, client_id, raw_notes, transcript")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { sessionId, deposited: 0, skipped: true, error: "session not found" };

  // Idempotency: already distilled?
  const { count } = await admin
    .from("cp_signals")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", session.coach_id).eq("source", "session").eq("ref_id", session.id);
  if ((count ?? 0) > 0) return { sessionId, deposited: 0, skipped: true };

  const text = [session.raw_notes, session.transcript].filter(Boolean).join("\n\n").trim();
  if (!text) return { sessionId, deposited: 0, skipped: true, error: "empty session" };

  let parsed;
  try {
    const out = await callLLM({ task: "distill", system: "Return only the JSON described.", user: buildDistillPrompt(text), maxTokens: 1400 });
    parsed = parseDistillResponse(out);
  } catch (err) {
    return { sessionId, deposited: 0, skipped: false, error: err instanceof Error ? err.message : String(err) };
  }

  const signals = toSignals(parsed, { sessionId: session.id, subjectId: session.client_id ?? null });
  let deposited = 0;
  for (const s of signals) {
    const { error } = await depositSignal(admin, session.coach_id, s);
    if (!error) deposited++;
  }

  // Durable facts: commitments -> goal, patterns -> fact. Reuse Dhara dedupe.
  const { data: memRows } = await admin.from("cp_coach_memory").select("*").eq("coach_id", session.coach_id).eq("status", "active");
  const existing = (memRows ?? []) as CoachMemory[];
  const durable: Array<{ kind: MemoryKind; text: string }> = [
    ...parsed.commitments.map((c) => ({ kind: "goal" as MemoryKind, text: c.text })),
    ...parsed.patterns.map((p) => ({ kind: "fact" as MemoryKind, text: p.text })),
  ];
  for (const cand of durable) {
    const r = mergeOrInsert(existing, cand);
    if (r.action === "insert") {
      const { data: ins } = await admin.from("cp_coach_memory").insert({
        coach_id: session.coach_id, kind: cand.kind, text: cand.text,
        source: "session", source_ref: session.id, confidence: r.confidence, status: "active",
      }).select("*").single();
      if (ins) existing.push(ins as CoachMemory);
    } else {
      await admin.from("cp_coach_memory").update({ confidence: r.confidence, last_seen_at: new Date(0).toISOString() === "" ? undefined : new Date(Date.now()).toISOString() })
        .eq("id", r.targetId).eq("coach_id", session.coach_id);
      const hit = existing.find((m) => normalizeMemoryText(m.text) === normalizeMemoryText(cand.text));
      if (hit) hit.confidence = r.confidence;
    }
  }

  return { sessionId, deposited, skipped: false };
}
```

> Note: confirm the `cp_coaching_sessions` columns (`client_id`, `raw_notes`, `transcript`, `coach_id`) and `CoachMemory` fields (`id, text, confidence, status, kind`) against the real files before running; adjust select lists if names differ. Keep `last_seen_at` update simple (`new Date(Date.now()).toISOString()`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `lib/distill/run-session-distill.ts`. Fix import/column drift if any.

- [ ] **Step 3: Commit**

```bash
git add lib/distill/run-session-distill.ts
git commit -m "feat(distill): shared session distill runner (deposit + memory upsert)"
```

---

### Task 6: On-demand distill route (user-authed)

**Files:**
- Create: `app/api/sessions/[id]/distill/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/sessions/[id]/distill/route.ts
// POST — distill the coach's own just-saved session. Verifies ownership, then
// runs the shared runner with a service-role client. Used for the felt deposit.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimitByUser } from "@/lib/rate-limit";
import { runSessionDistill } from "@/lib/distill/run-session-distill";

export const runtime = "edge";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "session/distill", 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  // Ownership check via the user-scoped (RLS) client.
  const { data: own } = await supabase
    .from("cp_coaching_sessions").select("id").eq("id", params.id).eq("coach_id", user.id).maybeSingle();
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await runSessionDistill(createAdminClient(), params.id);
  if (result.error && !result.skipped) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ deposited: result.deposited, skipped: result.skipped });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean for this file.

- [ ] **Step 3: Commit**

```bash
git add app/api/sessions/[id]/distill/route.ts
git commit -m "feat(distill): user-authed on-demand session distill route"
```

---

### Task 7: Cron sweep route

**Files:**
- Create: `app/api/cron/distill-signals/route.ts`
- Reference: `app/api/cron/brand-os-digest/route.ts` (auth block)

- [ ] **Step 1: Write the route**

```ts
// app/api/cron/distill-signals/route.ts
// CRON_SECRET sweep: distill recent sessions that have no signals yet.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { runSessionDistill } from "@/lib/distill/run-session-distill";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const provided =
    new URL(request.url).searchParams.get("key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  // Candidate sessions: newest 100, then skip ones already distilled (runner is idempotent).
  const { data: sessions } = await admin
    .from("cp_coaching_sessions")
    .select("id")
    .order("session_date", { ascending: false })
    .limit(100);

  let distilled = 0, skipped = 0;
  for (const s of (sessions ?? []).slice(0, 25)) {
    const r = await runSessionDistill(admin, s.id as string);
    if (r.skipped) skipped++; else distilled++;
  }
  return NextResponse.json({ distilled, skipped });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add app/api/cron/distill-signals/route.ts
git commit -m "feat(distill): CRON_SECRET sweep route (backstop)"
```

---

### Task 8: `lib/coaching-prep.ts` — confidence-gated brief

**Files:**
- Create: `lib/coaching-prep.ts`
- Test: `lib/__tests__/coaching-prep.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/coaching-prep.test.ts
import { describe, it, expect } from "vitest";
import { assemblePrep, type PrepSignal } from "@/lib/coaching-prep";

const sig = (over: Partial<PrepSignal>): PrepSignal => ({
  id: "x", kind: "topic", text: "t", evidence: "e", confidence: "candidate", status: "active",
  created_at: "2026-06-01T00:00:00Z", ...over,
});

describe("assemblePrep", () => {
  it("recap = topics from newest first", () => {
    const out = assemblePrep([sig({ kind: "topic", text: "older", created_at: "2026-05-01T00:00:00Z" }), sig({ kind: "topic", text: "newer", created_at: "2026-06-01T00:00:00Z" })]);
    expect(out.lastRecap[0]).toBe("newer");
  });
  it("firm commitments require confidence >= repeated; singles go to possible", () => {
    const out = assemblePrep([
      sig({ kind: "commitment", text: "firm", confidence: "repeated" }),
      sig({ kind: "commitment", text: "maybe", confidence: "candidate" }),
    ]);
    expect(out.openCommitments).toContain("firm");
    expect(out.possible).toContain("maybe");
    expect(out.openCommitments).not.toContain("maybe");
  });
  it("excludes dismissed", () => {
    const out = assemblePrep([sig({ kind: "commitment", text: "gone", confidence: "confirmed", status: "dismissed" })]);
    expect(out.openCommitments).not.toContain("gone");
  });
  it("patterns require >= repeated", () => {
    const out = assemblePrep([sig({ kind: "pattern", text: "weak", confidence: "candidate" }), sig({ kind: "pattern", text: "strong", confidence: "confirmed" })]);
    expect(out.formingPatterns).toEqual(["strong"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/coaching-prep.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/coaching-prep.ts
//
// Assembles the coaching-prep brief from a client's signals. Confidence-gates
// what surfaces as a firm commitment/pattern vs a "possible". Pure assembler
// (assemblePrep) + a thin DB loader (getCoachingPrep).

import type { SupabaseClient } from "@supabase/supabase-js";

export type PrepSignal = {
  id: string;
  kind: "topic" | "commitment" | "pattern" | "somatic" | "goal" | "note";
  text: string;
  evidence: string | null;
  confidence: "candidate" | "repeated" | "confirmed";
  status: "active" | "dismissed";
  created_at: string;
};

export type PrepItem = { id: string; text: string; evidence: string | null };
export type CoachingPrep = {
  lastRecap: string[];
  openCommitments: string[];
  formingPatterns: string[];
  possible: string[];
  items: PrepItem[]; // tap-to-source set (id -> evidence)
};

const firm = (c: PrepSignal["confidence"]) => c === "repeated" || c === "confirmed";

export function assemblePrep(signals: PrepSignal[]): CoachingPrep {
  const active = signals.filter((s) => s.status === "active");
  const byNewest = [...active].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const lastRecap = byNewest.filter((s) => s.kind === "topic").slice(0, 5).map((s) => s.text);
  const commitments = byNewest.filter((s) => s.kind === "commitment");
  const patterns = byNewest.filter((s) => s.kind === "pattern");

  const openCommitments = commitments.filter((s) => firm(s.confidence)).map((s) => s.text);
  const possible = commitments.filter((s) => !firm(s.confidence)).map((s) => s.text);
  const formingPatterns = patterns.filter((s) => firm(s.confidence)).map((s) => s.text);

  const items = byNewest.map((s) => ({ id: s.id, text: s.text, evidence: s.evidence }));
  return { lastRecap, openCommitments, formingPatterns, possible, items };
}

export async function getCoachingPrep(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
): Promise<CoachingPrep> {
  const { data } = await supabase
    .from("cp_signals")
    .select("id, kind, text, evidence, confidence, status, created_at")
    .eq("coach_id", coachId)
    .eq("subject_id", clientId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(200);
  return assemblePrep((data ?? []) as PrepSignal[]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/coaching-prep.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/coaching-prep.ts lib/__tests__/coaching-prep.test.ts
git commit -m "feat(prep): confidence-gated coaching-prep assembler + loader"
```

---

### Task 9: Dismiss route (signal → dismissed)

**Files:**
- Create: `app/api/signals/[id]/dismiss/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/signals/[id]/dismiss/route.ts
// POST — coach dismisses a surfaced signal ("not a pattern"). Flips the signal
// to dismissed (RLS scopes to owner). Append-only otherwise.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("cp_signals").update({ status: "dismissed" })
    .eq("id", params.id).eq("coach_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
```bash
git add app/api/signals/[id]/dismiss/route.ts
git commit -m "feat(signals): dismiss route"
```

---

### Task 10: `CoachingPrepCard` + felt-deposit status components

**Files:**
- Create: `components/coaching/CoachingPrepCard.tsx`
- Create: `components/sessions/SessionDistillStatus.tsx`
- Reference: `@/components/ui` (`Card`, `Badge`, `Button`) per `VoiceSetupFlow.tsx`

- [ ] **Step 1: Write `CoachingPrepCard.tsx`**

```tsx
// components/coaching/CoachingPrepCard.tsx
"use client";
// Push card shown when a coach opens a client / starts a session. Glanceable,
// tap-to-source, dismissible. Empty state is a forward-promise.
import { useState } from "react";
import { Badge, Card } from "@/components/ui";
import type { CoachingPrep } from "@/lib/coaching-prep";

export default function CoachingPrepCard({ prep, clientName }: { prep: CoachingPrep; clientName: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const empty = prep.lastRecap.length === 0 && prep.openCommitments.length === 0 && prep.formingPatterns.length === 0;
  if (empty) {
    return (
      <Card padding="md" className="bg-[var(--surface-elevated)]">
        <Badge tone="brand" size="xs" uppercase>Coaching prep</Badge>
        <p className="mt-2 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          First session with {clientName}. Save it, and the prep writes itself for next time.
        </p>
      </Card>
    );
  }

  const idFor = (text: string) => prep.items.find((i) => i.text === text)?.id ?? text;
  const evidenceFor = (text: string) => prep.items.find((i) => i.text === text)?.evidence ?? null;

  async function dismiss(text: string) {
    const id = idFor(text);
    setDismissed((p) => new Set(p).add(id));
    try { await fetch(`/api/signals/${id}/dismiss`, { method: "POST" }); } catch { /* optimistic */ }
  }

  const Row = ({ text }: { text: string }) => {
    const id = idFor(text);
    if (dismissed.has(id)) return null;
    const ev = evidenceFor(text);
    return (
      <li className="text-[length:var(--t-caption)] text-[color:var(--text)]">
        <button type="button" className="text-left" onClick={() => setOpen(open === id ? null : id)}>• {text}</button>
        <button type="button" onClick={() => dismiss(text)} className="ml-2 text-[color:var(--text-faint)] hover:text-[color:var(--danger)]" title="Not relevant">×</button>
        {open === id && ev && (
          <div className="mt-1 ml-3 text-[color:var(--text-muted)] italic">from your notes: &ldquo;{ev}&rdquo;</div>
        )}
      </li>
    );
  };

  return (
    <Card padding="md" className="border-[var(--border)] bg-[var(--surface-elevated)]">
      <Badge tone="brand" size="xs" uppercase>Coaching prep · {clientName}</Badge>
      {prep.lastRecap.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">Last time</div>
          <ul className="mt-1 space-y-1">{prep.lastRecap.map((t) => <Row key={t} text={t} />)}</ul>
        </div>
      )}
      {prep.openCommitments.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">Open commitments</div>
          <ul className="mt-1 space-y-1">{prep.openCommitments.map((t) => <Row key={t} text={t} />)}</ul>
        </div>
      )}
      {prep.formingPatterns.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">Pattern forming</div>
          <ul className="mt-1 space-y-1">{prep.formingPatterns.map((t) => <Row key={t} text={t} />)}</ul>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Write `SessionDistillStatus.tsx`**

```tsx
// components/sessions/SessionDistillStatus.tsx
"use client";
// Felt deposit: on mount (after a session saves and we land on /sessions/[id]),
// fire the on-demand distill and show the accrual landing.
import { useEffect, useState } from "react";

export default function SessionDistillStatus({ sessionId, clientName }: { sessionId: string; clientName: string }) {
  const [state, setState] = useState<"working" | "done" | "idle">("working");
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/distill`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) { setCount(data.deposited ?? 0); setState("done"); }
        else setState("idle");
      } catch { if (alive) setState("idle"); }
    })();
    return () => { alive = false; };
  }, [sessionId]);

  if (state === "idle") return null;
  return (
    <div className="rounded-[var(--r-md)] bg-[var(--brand-soft)] border border-[var(--brand)] px-4 py-2 text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
      {state === "working"
        ? <>Captured. Adding to {clientName}&rsquo;s memory&hellip;</>
        : <>Remembered {count} thing{count === 1 ? "" : "s"} about {clientName}.</>}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean for both files. Confirm `Card`/`Badge` prop API against `components/ui` (see `VoiceSetupFlow.tsx`); adapt if needed.

- [ ] **Step 4: Commit**

```bash
git add components/coaching/CoachingPrepCard.tsx components/sessions/SessionDistillStatus.tsx
git commit -m "feat(prep): CoachingPrepCard + SessionDistillStatus (felt deposit)"
```

---

### Task 11: Mount the brief + felt deposit on real surfaces

**Files:**
- Modify: `app/sessions/[id]/page.tsx` (mount `SessionDistillStatus` + `CoachingPrepCard`)
- Modify: the client/lead detail page (mount `CoachingPrepCard`)

- [ ] **Step 1: Mount on the session detail page**

Read `app/sessions/[id]/page.tsx`. It is a server component with `user` + the session row + `client_id`. After loading the session, fetch prep and render both components near the top of the session view:

```tsx
import SessionDistillStatus from "@/components/sessions/SessionDistillStatus";
import CoachingPrepCard from "@/components/coaching/CoachingPrepCard";
import { getCoachingPrep } from "@/lib/coaching-prep";
// ...after you have `supabase`, `user`, `session` (with session.client_id) and the client's name:
const prep = session.client_id ? await getCoachingPrep(supabase, user.id, session.client_id) : null;
// in JSX, above the session notes:
<SessionDistillStatus sessionId={session.id} clientName={clientName} />
{prep && <CoachingPrepCard prep={prep} clientName={clientName} />}
```
If the page lacks the client's display name, derive it from the existing lead lookup on that page (or `cp_leads.full_name` by `session.client_id`). Keep changes minimal and server-rendered except the two client components.

- [ ] **Step 2: Mount the prep card on the client/lead detail surface**

Read the lead/client detail page (the one that shows a single `cp_leads` row, e.g. `app/clients/[id]/page.tsx` or the LeadDetail surface). Add, near the top:
```tsx
const prep = await getCoachingPrep(supabase, user.id, leadId);
{/* render */}
{prep && <CoachingPrepCard prep={prep} clientName={leadName} />}
```
Only add the import + the two lines; do not restructure the page. If the exact path/variable differs, adapt to the real names you find.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: clean; `/api/sessions/[id]/distill`, `/api/cron/distill-signals`, `/api/signals/[id]/dismiss` present.

- [ ] **Step 4: Commit**

```bash
git add app/sessions/[id]/page.tsx
# plus the client/lead detail page you modified
git commit -m "feat(prep): mount coaching prep + felt deposit on session and client surfaces"
```

---

### Task 12: Eval harness (golden set + script)

**Files:**
- Create: `eval/distill/golden.jsonl`, `scripts/eval-distill.mjs`, `docs/qa/distill-eval.md`
- Modify: `package.json` (`"eval:distill"`)

- [ ] **Step 1: Seed the golden format with one real pair**

```jsonl
{"id":"clarity-mornings","notes":"Client kept skipping morning routine. Said discipline is the problem but it's clarity. Committed to a 5-minute breath drill each morning before phone. Noticed shoulders drop when he talked about quitting the side job.","expected":{"topics":["morning routine","clarity vs discipline"],"commitments":["5-minute breath drill each morning before phone"],"patterns":["avoids mornings"],"somatic":["shoulders drop when discussing the side job"]}}
```
(Hand-label ~10 real sessions over time; the `expected` set DEFINES the taxonomy and is Sunny's to write.)

- [ ] **Step 2: Write `scripts/eval-distill.mjs`**

A Node ESM script mirroring `scripts/eval-polish.mjs`: read `eval/distill/golden.jsonl`; for each, call OpenRouter (`process.env.OPENROUTER_API_KEY`, model from `LLM_MODEL_DISTILL` or `google/gemini-2.5-flash`) with the distill prompt; parse; run deterministic checks (every `evidence` is a substring of `notes`; no em-dash; no empty text) + an LLM judge scoring signal accuracy vs `expected` AND prep usefulness; print `✓/✗` per item and `pass/total`; exit non-zero on regression. Require `OPENROUTER_API_KEY` (exit 2 if unset). Do not run the eval in CI by default.

- [ ] **Step 3: Add the npm script + doc**

`package.json` scripts: `"eval:distill": "node scripts/eval-distill.mjs"`. Write `docs/qa/distill-eval.md` (how to run, golden format, judge calibration against Sunny's ratings, the gate) mirroring `docs/qa/polish-eval.md`.

- [ ] **Step 4: Verify the script parses**

Run: `node --check scripts/eval-distill.mjs`
Expected: exit 0. Do NOT run the full eval (needs key + network).

- [ ] **Step 5: Commit**

```bash
git add eval/distill/golden.jsonl scripts/eval-distill.mjs docs/qa/distill-eval.md package.json
git commit -m "feat(distill): eval harness (golden set + signal-accuracy + prep-usefulness)"
```

---

### Task 13: Full verification pass

**Files:** none

- [ ] **Step 1:** `npx vitest run` — all prior + new pure tests pass.
- [ ] **Step 2:** `npx tsc --noEmit && npx next build` — clean; new routes present.
- [ ] **Step 3:** Manual smoke (local, signed-in coach with a client): save a session → land on `/sessions/[id]` → see "Captured. Adding to [client]'s memory…" → "Remembered N things." Open the client → see the prep card; tap an item → see the source quote; dismiss one → it disappears and stays gone on reload.
- [ ] **Step 4:** Live RLS check via Supabase MCP: `cp_signals` `relrowsecurity = true`, policy `auth.uid() = coach_id`.
- [ ] **Step 5:** Commit any fixes; push.

```bash
git push origin <branch>
```

---

## Self-Review

**1. Spec coverage:**
- Append-only `cp_signals` + RLS + `depositSignal()` → Tasks 1, 2. ✅
- Provenance (evidence on every signal) → Tasks 1, 4 (parser keeps evidence), 5 (deposited). ✅
- `cp_coach_memory` source extension + mergeOrInsert reuse → Tasks 1, 5. ✅
- Distiller, on-demand + cron sweep, idempotent → Tasks 5, 6, 7. ✅
- Felt deposit → Task 10 (`SessionDistillStatus`) + Task 11 mount. ✅
- Confidence-gated brief, tap-to-source, dismissible, empty-promise → Tasks 8, 9, 10, 11. ✅
- `lib/llm.ts` OpenRouter per-task; distiller is the v1 consumer (Dhara migration deferred) → Task 3. ✅
- Golden set first + signal-accuracy AND prep-usefulness eval → Task 12. ✅
- Privacy RLS verified live → Tasks 1, 13. ✅

**2. Placeholder scan:** Task 12 Steps 2-3 describe the eval script in prose rather than full code (it closely mirrors the committed `scripts/eval-polish.mjs`); the golden `expected` set is intentionally Sunny's to hand-label. Task 11 gives exact insert code with a read-first instruction because the session/client page internals are read at execution time. No TBD/TODO in logic tasks.

**3. Type consistency:** `NewSignal`/`SignalKind`/`SignalSource` (Task 2) reused in Tasks 4, 5. `DistillParsed`/`DistillItem` (Task 4) reused in Task 5. `CoachingPrep`/`PrepSignal` (Task 8) reused in Task 10. Route response `{ deposited, skipped }` (Task 6) matches `SessionDistillStatus` (Task 10). `mergeOrInsert(existing, candidate)→{action,confidence,targetId?}` used per its real signature in Task 5.

**4. Build order:** golden set is conceptually first (spec §10) but appears as Task 12 because the eval script depends on the distill prompt (Task 4); the labeling is Sunny's parallel track. Flagged so execution doesn't block on it.
