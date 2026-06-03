# Dhara v0 — Ambient "Talk + Remember" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An ambient AI companion ("Dhara") on every authed screen: the coach talks (type or voice), it streams a grounded-guide reply grounded in Brand OS + a live business snapshot + a growing memory, and it quietly learns durable, editable memories from every conversation.

**Architecture:** A global `DharaProvider` + `DharaBar` mounted in `app/layout.tsx` (self-gating off public routes). `POST /api/dhara/chat` streams Anthropic (`claude-sonnet-4-6`, `stream:true`). Grounding assembled by `lib/dhara/context.ts` (Brand OS synthesis + `getBusinessPulse` + memories). After each turn the client calls `POST /api/dhara/learn` → cheap-model extraction into a new `cp_coach_memory` store with a confidence ladder (candidate → repeated → confirmed) + provenance. An autonomy seam (`lib/dhara/suggestions.ts`) is built but fixed at "suggest" (navigate only).

**Tech Stack:** Next.js App Router (edge), Supabase, Anthropic (Sonnet 4.6 chat; Haiku `claude-haiku-4-5` for extraction), Deepgram (via existing `SpeakOrType`), design tokens, Vitest.

**Reference:** Spec `docs/superpowers/specs/2026-06-02-dhara-v0-talk-remember-design.md`. Visuals: `docs/superpowers/mockups/2026-06-02-dhara-visual-explainer.html`.

**Verified codebase facts:**
- Anthropic pattern: `fetch("https://api.anthropic.com/v1/messages", { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, body: {...} })`; model `claude-sonnet-4-6`. Non-streaming today; add `stream:true`.
- `getBusinessPulse(coachId, now)` in `lib/ambient.ts` returns `{ heroItem, quietList, daySummary, metrics:{revenue:{amount,trend}, activeMembers, sessionsThisMonth, trustRate}, honestQuestion }`.
- Brand OS: `cp_brand_os_runs` rows have `synthesis_json` (loosely typed; has `pillars`, often `avatar`/`voice`). Read defensively.
- Auth: server `createClient()` from `@/lib/supabase-server`; admin `createAdminClient()` from `@/lib/supabase-admin`. Migrations applied via Supabase MCP.
- `SpeakOrType` at `@/components/voice/SpeakOrType` (props `value,onChange,placeholder,disabled,minRows,maxLength`).
- Root layout `app/layout.tsx` wraps everything (incl. login + public `/q/[slug]`). The bar must hide on public/unauthed routes.

---

## File Structure
```
Create:
  supabase/migrations/<ts>_dhara_memory_and_messages.sql
  lib/dhara/memory.ts            # types + extraction prompt + dedup/promote (pure)
  lib/dhara/persona.ts           # buildDharaSystemPrompt (pure)
  lib/dhara/suggestions.ts       # DharaSuggestion type + deriveSuggestions + executeSuggestion (pure-ish)
  lib/dhara/context.ts           # getDharaContext (brand os + getBusinessPulse + memories)
  lib/__tests__/dhara-memory.test.ts
  lib/__tests__/dhara-persona.test.ts
  lib/__tests__/dhara-suggestions.test.ts
  app/api/dhara/messages/route.ts
  app/api/dhara/memory/route.ts
  app/api/dhara/chat/route.ts
  app/api/dhara/learn/route.ts
  components/dhara/DharaProvider.tsx
  components/dhara/DharaBar.tsx
  components/dhara/DharaConversation.tsx
  components/dhara/DharaMemoryView.tsx
Modify:
  app/layout.tsx                 # mount <DharaProvider><DharaBar/></DharaProvider>
```

Recommended model per task: standard (sonnet) throughout; Tasks 8 (streaming) and 11 (provider) are the trickiest.

---

## Task 1: Migration — memory + messages tables

**Files:** Create `supabase/migrations/20260602_dhara_memory_and_messages.sql`

- [ ] **Step 1: Write the migration**
```sql
-- Dhara: the coach's growing memory + conversation log.
create table if not exists public.cp_coach_memory (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fact','preference','goal','audience','voice_note')),
  text text not null,
  source text not null check (source in ('conversation','explicit','brand_os')),
  source_ref text,
  confidence text not null default 'candidate' check (confidence in ('candidate','repeated','confirmed')),
  status text not null default 'active' check (status in ('active','forgotten')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.cp_coach_memory enable row level security;
drop policy if exists "coach owns memory" on public.cp_coach_memory;
create policy "coach owns memory" on public.cp_coach_memory
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);
create index if not exists cp_coach_memory_active on public.cp_coach_memory (coach_id, status, confidence);

create table if not exists public.cp_dhara_messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.cp_dhara_messages enable row level security;
drop policy if exists "coach owns dhara messages" on public.cp_dhara_messages;
create policy "coach owns dhara messages" on public.cp_dhara_messages
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);
create index if not exists cp_dhara_messages_recent on public.cp_dhara_messages (coach_id, created_at desc);
```

- [ ] **Step 2: Commit (controller applies to DB via Supabase MCP)**
```bash
git add supabase/migrations/20260602_dhara_memory_and_messages.sql
git commit -m "feat: dhara memory + messages tables"
```
Do NOT apply to the DB yourself — report DONE; the controller applies the migration deliberately.

---

## Task 2: Memory core (types + dedup/promote) — TDD

**Files:** Create `lib/dhara/memory.ts`, Test `lib/__tests__/dhara-memory.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect } from "vitest";
import { normalizeMemoryText, mergeOrInsert, parseExtraction, type CoachMemory } from "@/lib/dhara/memory";

const base = (over: Partial<CoachMemory> = {}): CoachMemory => ({
  id: "m1", coachId: "c1", kind: "preference", text: "Prefers short DMs",
  source: "conversation", sourceRef: null, confidence: "candidate", status: "active",
  ...over,
});

describe("normalizeMemoryText", () => {
  it("lowercases, trims, collapses spaces, strips trailing punctuation", () => {
    expect(normalizeMemoryText("  Prefers   short DMs. ")).toBe("prefers short dms");
  });
});

describe("mergeOrInsert", () => {
  it("inserts when no match", () => {
    const r = mergeOrInsert([], { kind: "preference", text: "Prefers short DMs" });
    expect(r.action).toBe("insert");
    expect(r.confidence).toBe("candidate");
  });
  it("promotes candidate -> repeated on duplicate text", () => {
    const r = mergeOrInsert([base()], { kind: "preference", text: "prefers short DMS" });
    expect(r.action).toBe("promote");
    expect(r.targetId).toBe("m1");
    expect(r.confidence).toBe("repeated");
  });
  it("keeps confirmed as confirmed on duplicate", () => {
    const r = mergeOrInsert([base({ confidence: "confirmed" })], { kind: "preference", text: "Prefers short DMs" });
    expect(r.action).toBe("promote");
    expect(r.confidence).toBe("confirmed");
  });
});

describe("parseExtraction", () => {
  it("parses a JSON array of memories", () => {
    const out = parseExtraction('[{"kind":"goal","text":"Launching a men\'s cohort in fall"}]');
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("goal");
  });
  it("returns [] on junk / non-array / bad kinds", () => {
    expect(parseExtraction("not json")).toEqual([]);
    expect(parseExtraction('{"kind":"goal"}')).toEqual([]);
    expect(parseExtraction('[{"kind":"banana","text":"x"}]')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run lib/__tests__/dhara-memory.test.ts`

- [ ] **Step 3: Implement `lib/dhara/memory.ts`**
```ts
// lib/dhara/memory.ts
// Dhara memory core: types, extraction parsing, and the dedup/promote ladder.
// Pure functions only — DB I/O lives in the routes.

export type MemoryKind = "fact" | "preference" | "goal" | "audience" | "voice_note";
export type MemoryConfidence = "candidate" | "repeated" | "confirmed";
export type MemoryStatus = "active" | "forgotten";

export type CoachMemory = {
  id: string;
  coachId: string;
  kind: MemoryKind;
  text: string;
  source: "conversation" | "explicit" | "brand_os";
  sourceRef: string | null;
  confidence: MemoryConfidence;
  status: MemoryStatus;
};

export const MEMORY_KINDS: MemoryKind[] = ["fact", "preference", "goal", "audience", "voice_note"];

export function normalizeMemoryText(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!,;:]+$/g, "");
}

export type ExtractedMemory = { kind: MemoryKind; text: string };

export function parseExtraction(raw: string): ExtractedMemory[] {
  let data: unknown;
  try { data = JSON.parse(raw.trim()); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const out: ExtractedMemory[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const kind = (item as { kind?: unknown }).kind;
    const text = (item as { text?: unknown }).text;
    if (typeof text !== "string" || !text.trim()) continue;
    if (typeof kind !== "string" || !MEMORY_KINDS.includes(kind as MemoryKind)) continue;
    out.push({ kind: kind as MemoryKind, text: text.trim() });
  }
  return out;
}

export type MergeResult =
  | { action: "insert"; confidence: "candidate" }
  | { action: "promote"; targetId: string; confidence: MemoryConfidence };

// Promote one rung: candidate -> repeated -> confirmed (confirmed stays).
function bump(c: MemoryConfidence): MemoryConfidence {
  return c === "candidate" ? "repeated" : c === "repeated" ? "confirmed" : "confirmed";
}

export function mergeOrInsert(
  existing: CoachMemory[],
  candidate: ExtractedMemory,
): MergeResult {
  const norm = normalizeMemoryText(candidate.text);
  const match = existing.find((m) => m.status === "active" && normalizeMemoryText(m.text) === norm);
  if (!match) return { action: "insert", confidence: "candidate" };
  return { action: "promote", targetId: match.id, confidence: bump(match.confidence) };
}

// Prompt for the cheap extraction model. Strict: durable facts only, JSON array.
export function buildExtractionPrompt(userMessage: string, assistantMessage: string): string {
  return [
    "From the exchange below, extract 0 to 3 DURABLE memories about the COACH that would help a future conversation.",
    "Durable = stable preferences, goals, audience facts, how they like to work, who they are. NOT ephemera, NOT the assistant's words, NOT one-off task details.",
    "Return ONLY a JSON array (no prose, no fences) of objects: {\"kind\": one of fact|preference|goal|audience|voice_note, \"text\": short third-person statement}.",
    "If nothing durable, return [].",
    "",
    `COACH: ${userMessage}`,
    `ASSISTANT: ${assistantMessage}`,
  ].join("\n");
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run lib/__tests__/dhara-memory.test.ts` (8 tests). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**
```bash
git add lib/dhara/memory.ts lib/__tests__/dhara-memory.test.ts
git commit -m "feat: dhara memory core (types, extraction parse, dedup/promote ladder)"
```

---

## Task 3: Persona system prompt — TDD

**Files:** Create `lib/dhara/persona.ts`, Test `lib/__tests__/dhara-persona.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect } from "vitest";
import { buildDharaSystemPrompt, type DharaContext } from "@/lib/dhara/persona";

const ctx: DharaContext = {
  coachFirstName: "Sunny",
  identityText: "Avatar: men's coaches. Voice: direct, somatic. Pillars: nervous system, purpose, integration.",
  snapshotText: "Revenue this month: $14,000 (up). 2 clients quiet. 11 drafts ready.",
  memories: [
    { text: "Prefers short DMs", confidence: "confirmed" },
    { text: "Might be launching a fall cohort", confidence: "candidate" },
  ],
};

describe("buildDharaSystemPrompt", () => {
  it("includes the grounded-guide voice and the core guardrails", () => {
    const p = buildDharaSystemPrompt(ctx).toLowerCase();
    expect(p).toContain("grounded");
    expect(p).toContain("amplify");      // amplify, never originate
    expect(p).toContain("never invent"); // no invented business numbers
  });
  it("contains no em dashes (house rule)", () => {
    expect(buildDharaSystemPrompt(ctx)).not.toContain("—");
  });
  it("states confirmed memories as fact and flags candidates as unconfirmed", () => {
    const p = buildDharaSystemPrompt(ctx);
    expect(p).toContain("Prefers short DMs");
    expect(p).toMatch(/unconfirmed[^\n]*fall cohort|fall cohort[^\n]*unconfirmed/i);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement `lib/dhara/persona.ts`**
```ts
// lib/dhara/persona.ts
// Dhara's voice + grounding rules. Pure builder so it can be eval'd later.

export type DharaContext = {
  coachFirstName: string;
  identityText: string;   // from Brand OS synthesis (live)
  snapshotText: string;   // from getBusinessPulse (live)
  memories: Array<{ text: string; confidence: "candidate" | "repeated" | "confirmed" }>;
};

export function buildDharaSystemPrompt(ctx: DharaContext): string {
  const confirmed = ctx.memories.filter((m) => m.confidence !== "candidate").map((m) => `- ${m.text}`);
  const candidates = ctx.memories.filter((m) => m.confidence === "candidate").map((m) => `- ${m.text} (unconfirmed, do not assert as fact)`);

  return [
    `You are Dhara, a grounded guide inside ${ctx.coachFirstName}'s coaching platform.`,
    "",
    "VOICE: Calm, spacious, somatic. Few words that land. You speak like a seasoned men's-work facilitator, not a chatbot. You slow the coach down and mirror them back. You never hype, never pad, never use corporate language. Do not use em dashes.",
    "",
    "WHO YOU ARE: You amplify the coach, you never originate their voice. The coach decides; you serve. You are a practice partner, not software, and never pretend the AI is the transformation. The coach is.",
    "",
    "GROUNDING RULES: Use only what is given below. Never invent business numbers, names, or facts. Treat unconfirmed memories softly. If you are unsure, ask one clean question rather than guess.",
    "",
    "WHEN AN ACTION WOULD HELP: offer it as a suggestion (for example, 'Want me to draft a check-in?'). Do not take actions yourself.",
    "",
    "WHO THE COACH IS (from their Brand OS):",
    ctx.identityText || "(not set up yet)",
    "",
    "THEIR BUSINESS RIGHT NOW:",
    ctx.snapshotText || "(no snapshot available)",
    "",
    "WHAT YOU KNOW ABOUT THEM (confirmed):",
    confirmed.length ? confirmed.join("\n") : "- (nothing yet)",
    "",
    "WHAT YOU SUSPECT (unconfirmed, flavor only):",
    candidates.length ? candidates.join("\n") : "- (nothing yet)",
  ].join("\n");
}
```

- [ ] **Step 4: Run, verify PASS** (3 tests). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**
```bash
git add lib/dhara/persona.ts lib/__tests__/dhara-persona.test.ts
git commit -m "feat: dhara persona system-prompt builder"
```

---

## Task 4: Autonomy seam (suggestions) — TDD

**Files:** Create `lib/dhara/suggestions.ts`, Test `lib/__tests__/dhara-suggestions.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
import { describe, it, expect } from "vitest";
import { deriveSuggestions, type DharaSuggestion } from "@/lib/dhara/suggestions";

describe("deriveSuggestions", () => {
  const leads = [{ id: "l1", name: "Marcus Lee" }, { id: "l2", name: "Dana" }];
  it("offers a navigate suggestion for a lead named in the reply", () => {
    const s = deriveSuggestions("Marcus has gone quiet. Reach out?", leads);
    expect(s.some((x) => x.kind === "navigate" && x.href === "/leads/l1")).toBe(true);
  });
  it("always includes a disabled compose 'soon' suggestion when a lead is mentioned", () => {
    const s = deriveSuggestions("Marcus has gone quiet.", leads);
    expect(s.some((x) => x.kind === "compose" && x.level === "suggest")).toBe(true);
  });
  it("returns [] when no known lead is mentioned", () => {
    expect(deriveSuggestions("Your month looks steady.", leads)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

- [ ] **Step 3: Implement `lib/dhara/suggestions.ts`**
```ts
// lib/dhara/suggestions.ts
// The autonomy seam. v0 only emits "suggest"-level suggestions; the executor
// performs only safe navigation. draft/act are defined but inert.

export type DharaSuggestion = {
  level: "suggest" | "draft" | "act";
  kind: "navigate" | "compose" | "create" | "note";
  label: string;
  href?: string;
  enabled: boolean;        // false => render as "soon"
  payload?: Record<string, unknown>;
};

export function deriveSuggestions(
  replyText: string,
  leads: Array<{ id: string; name: string }>,
): DharaSuggestion[] {
  const out: DharaSuggestion[] = [];
  const lower = replyText.toLowerCase();
  const mentioned = leads.find((l) => l.name && lower.includes(l.name.toLowerCase()));
  if (mentioned) {
    out.push({ level: "suggest", kind: "navigate", label: `Open ${mentioned.name}`, href: `/leads/${mentioned.id}`, enabled: true });
    out.push({ level: "suggest", kind: "compose", label: `Draft a check-in for ${mentioned.name}`, enabled: false });
  }
  return out;
}

// Client executor. v0: navigate only. Returns the href to push, or null.
export function executeSuggestion(s: DharaSuggestion): { navigateTo: string } | null {
  if (s.kind === "navigate" && s.enabled && s.href) return { navigateTo: s.href };
  return null; // draft/act/disabled are inert in v0
}
```

- [ ] **Step 4: Run, verify PASS** (3 tests). `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**
```bash
git add lib/dhara/suggestions.ts lib/__tests__/dhara-suggestions.test.ts
git commit -m "feat: dhara autonomy seam (suggest-only, navigate executor)"
```

---

## Task 5: Grounding context assembler

**Files:** Create `lib/dhara/context.ts` (integration; tsc-verified)

- [ ] **Step 1: Implement `lib/dhara/context.ts`**
```ts
// lib/dhara/context.ts
// Assembles Dhara's live grounding: Brand OS identity + business snapshot + memories + lead names.

import { createClient } from "@/lib/supabase-server";
import { getBusinessPulse } from "@/lib/ambient";
import type { CoachMemory } from "@/lib/dhara/memory";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export type DharaGrounding = {
  identityText: string;
  snapshotText: string;
  memories: CoachMemory[];
  leads: Array<{ id: string; name: string }>;
};

export async function getDharaContext(coachId: string, now: number): Promise<DharaGrounding> {
  const supabase = createClient();

  const [{ data: runRows }, { data: memRows }, { data: leadRows }, pulse] = await Promise.all([
    supabase.from("cp_brand_os_runs").select("synthesis_json").eq("coach_id", coachId)
      .not("synthesis_json", "is", null).eq("state", "complete")
      .order("synthesized_at", { ascending: false }).limit(1),
    supabase.from("cp_coach_memory").select("*").eq("coach_id", coachId).eq("status", "active")
      .order("confidence", { ascending: false }).order("last_seen_at", { ascending: false }).limit(200),
    supabase.from("cp_leads").select("id, full_name").eq("coach_id", coachId).limit(500),
    getBusinessPulse(coachId, now),
  ]);

  // Identity from Brand OS synthesis (defensive: synthesis_json is loosely typed).
  const synth = (runRows?.[0]?.synthesis_json ?? {}) as Record<string, unknown>;
  const pillars = Array.isArray(synth.pillars)
    ? (synth.pillars as Array<Record<string, unknown>>).map((p) => String(p.name ?? p.title ?? "")).filter(Boolean)
    : [];
  const avatar = typeof synth.avatar === "string" ? synth.avatar
    : typeof (synth.avatar as Record<string, unknown>)?.summary === "string" ? String((synth.avatar as Record<string, unknown>).summary) : "";
  const identityText = [
    avatar ? `Avatar: ${avatar}` : "",
    pillars.length ? `Pillars: ${pillars.join(", ")}` : "",
  ].filter(Boolean).join("\n") || "(Brand OS not set up yet)";

  // Business snapshot from getBusinessPulse.
  const m = pulse.metrics;
  const slipping = pulse.quietList.concat(pulse.heroItem ? [pulse.heroItem] : [])
    .filter((i) => i.source === "overdue").map((i) => i.leadName).filter(Boolean);
  const snapshotText = [
    `Revenue this month: ${usd(m.revenue.amount)} (${m.revenue.trend}).`,
    `Active members: ${m.activeMembers}. Sessions this month: ${m.sessionsThisMonth}.`,
    `Drafts ready: ${pulse.daySummary.draftsReady}. Leads waiting: ${pulse.daySummary.leadsWaiting}.`,
    slipping.length ? `Quiet clients: ${slipping.join(", ")}.` : "",
  ].filter(Boolean).join(" ");

  const memories = (memRows ?? []).map((r) => ({
    id: r.id, coachId: r.coach_id, kind: r.kind, text: r.text, source: r.source,
    sourceRef: r.source_ref, confidence: r.confidence, status: r.status,
  })) as CoachMemory[];

  const leads = (leadRows ?? []).map((l) => ({ id: l.id as string, name: (l.full_name as string) ?? "" }));

  return { identityText, snapshotText, memories, leads };
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean. (If `getBusinessPulse` field names differ, align to `lib/ambient.ts` `BusinessPulse` type.)

- [ ] **Step 3: Commit**
```bash
git add lib/dhara/context.ts
git commit -m "feat: dhara grounding context assembler"
```

---

## Task 6: Messages route (GET history)

**Files:** Create `app/api/dhara/messages/route.ts`

- [ ] **Step 1: Implement**
```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
export const runtime = "edge";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("cp_dhara_messages")
    .select("id, role, content, created_at")
    .eq("coach_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);

  const messages = (data ?? []).reverse(); // chronological
  return NextResponse.json({ messages });
}
```

- [ ] **Step 2: Verify + commit**
```bash
npx tsc --noEmit
git add app/api/dhara/messages/route.ts
git commit -m "feat: dhara messages history route"
```

---

## Task 7: Memory route (list / edit-confirm / forget)

**Files:** Create `app/api/dhara/memory/route.ts`

- [ ] **Step 1: Implement**
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
export const runtime = "edge";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase.from("cp_coach_memory")
    .select("id, kind, text, source, source_ref, confidence, status, created_at")
    .eq("coach_id", user.id).eq("status", "active")
    .order("confidence", { ascending: false }).order("last_seen_at", { ascending: false });
  return NextResponse.json({ memories: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { id?: string; text?: string; confirm?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.text === "string") patch.text = body.text.trim().slice(0, 400);
  if (body.confirm) patch.confidence = "confirmed";
  const { error } = await supabase.from("cp_coach_memory").update(patch).eq("id", body.id).eq("coach_id", user.id);
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  // Soft delete (auditable).
  const { error } = await supabase.from("cp_coach_memory")
    .update({ status: "forgotten", updated_at: new Date().toISOString() })
    .eq("id", body.id).eq("coach_id", user.id);
  if (error) return NextResponse.json({ error: "Forget failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify + commit**
```bash
npx tsc --noEmit
git add app/api/dhara/memory/route.ts
git commit -m "feat: dhara memory route (list, edit/confirm, forget)"
```

---

## Task 8: Streaming chat route

**Files:** Create `app/api/dhara/chat/route.ts`

- [ ] **Step 1: Implement**
```ts
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimitByUser } from "@/lib/rate-limit";
import { getDharaContext } from "@/lib/dhara/context";
import { buildDharaSystemPrompt } from "@/lib/dhara/persona";
import { userFirstName } from "@/lib/user-display";

export const runtime = "edge";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const rl = rateLimitByUser(user.id, "dhara/chat", 20, 60_000);
  if (!rl.allowed) return new Response(JSON.stringify({ error: "Slow down a moment." }), { status: 429 });

  let body: { message?: string };
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }
  const message = (body.message ?? "").trim().slice(0, 4000);
  if (!message) return new Response(JSON.stringify({ error: "Empty message" }), { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "AI unavailable" }), { status: 503 });

  const admin = createAdminClient();
  const now = Date.now();

  // Persist user message + load recent turns + grounding (in parallel-ish).
  await admin.from("cp_dhara_messages").insert({ coach_id: user.id, role: "user", content: message });
  const [{ data: recent }, grounding] = await Promise.all([
    supabase.from("cp_dhara_messages").select("role, content").eq("coach_id", user.id)
      .order("created_at", { ascending: false }).limit(12),
    getDharaContext(user.id, now),
  ]);

  const system = buildDharaSystemPrompt({
    coachFirstName: userFirstName(user.email, user.user_metadata),
    identityText: grounding.identityText,
    snapshotText: grounding.snapshotText,
    memories: grounding.memories.map((m) => ({ text: m.text, confidence: m.confidence })),
  });

  const history = (recent ?? []).reverse().map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, stream: true, system, messages: history }),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: "AI error" }), { status: 502 });
  }

  // Re-stream just the text deltas to the client; accumulate to persist on close.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let full = "";
  let buffer = "";

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        if (full.trim()) {
          await admin.from("cp_dhara_messages").insert({ coach_id: user.id, role: "assistant", content: full });
        }
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            const text = evt.delta.text as string;
            full += text;
            controller.enqueue(encoder.encode(text));
          }
        } catch { /* ignore keep-alives / partials */ }
      }
    },
    cancel() { reader.cancel(); },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } });
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean. (Confirm `userFirstName` is exported from `@/lib/user-display`; if its signature differs, adapt.)

- [ ] **Step 3: Commit**
```bash
git add app/api/dhara/chat/route.ts
git commit -m "feat: dhara streaming chat route"
```

---

## Task 9: Learn route (extract → memory → suggestions)

**Files:** Create `app/api/dhara/learn/route.ts`

- [ ] **Step 1: Implement**
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimitByUser } from "@/lib/rate-limit";
import { buildExtractionPrompt, parseExtraction, mergeOrInsert, type CoachMemory } from "@/lib/dhara/memory";
import { deriveSuggestions } from "@/lib/dhara/suggestions";

export const runtime = "edge";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const EXTRACT_MODEL = "claude-haiku-4-5";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = rateLimitByUser(user.id, "dhara/learn", 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ newlyLearned: [], suggestions: [] });

  let body: { userMessage?: string; assistantMessage?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const um = (body.userMessage ?? "").slice(0, 4000);
  const am = (body.assistantMessage ?? "").slice(0, 4000);

  // Suggestions from the reply (needs lead names).
  const { data: leadRows } = await supabase.from("cp_leads").select("id, full_name").eq("coach_id", user.id).limit(500);
  const leads = (leadRows ?? []).map((l) => ({ id: l.id as string, name: (l.full_name as string) ?? "" }));
  const suggestions = deriveSuggestions(am, leads);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || (!um && !am)) return NextResponse.json({ newlyLearned: [], suggestions });

  // Extract candidate memories on the cheap model.
  let extracted: ReturnType<typeof parseExtraction> = [];
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: EXTRACT_MODEL, max_tokens: 400, messages: [{ role: "user", content: buildExtractionPrompt(um, am) }] }),
    });
    if (res.ok) {
      const json = await res.json();
      extracted = parseExtraction(String(json?.content?.[0]?.text ?? ""));
    }
  } catch { /* extraction is best-effort */ }
  if (extracted.length === 0) return NextResponse.json({ newlyLearned: [], suggestions });

  const admin = createAdminClient();
  const { data: existingRows } = await admin.from("cp_coach_memory").select("*").eq("coach_id", user.id).eq("status", "active");
  const existing = (existingRows ?? []).map((r) => ({
    id: r.id, coachId: r.coach_id, kind: r.kind, text: r.text, source: r.source,
    sourceRef: r.source_ref, confidence: r.confidence, status: r.status,
  })) as CoachMemory[];

  const newlyLearned: Array<{ id: string; text: string; kind: string; confidence: string }> = [];
  const nowIso = new Date().toISOString();

  for (const cand of extracted.slice(0, 3)) {
    const r = mergeOrInsert(existing, cand);
    if (r.action === "insert") {
      const { data: ins } = await admin.from("cp_coach_memory").insert({
        coach_id: user.id, kind: cand.kind, text: cand.text, source: "conversation", confidence: "candidate",
      }).select("id, text, kind, confidence").single();
      if (ins) {
        newlyLearned.push(ins);
        existing.push({ id: ins.id, coachId: user.id, kind: cand.kind, text: cand.text, source: "conversation", sourceRef: null, confidence: "candidate", status: "active" });
      }
    } else {
      await admin.from("cp_coach_memory").update({ confidence: r.confidence, last_seen_at: nowIso }).eq("id", r.targetId).eq("coach_id", user.id);
    }
  }

  return NextResponse.json({ newlyLearned, suggestions });
}
```

- [ ] **Step 2: Verify + commit** — `npx tsc --noEmit` clean. (If `claude-haiku-4-5` is not the right cheap model id, use whatever Haiku id the project uses elsewhere.)
```bash
git add app/api/dhara/learn/route.ts
git commit -m "feat: dhara learn route (extract memories + derive suggestions)"
```

---

## Task 10: DharaProvider (global state + streaming send)

**Files:** Create `components/dhara/DharaProvider.tsx`

- [ ] **Step 1: Implement**
```tsx
"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { executeSuggestion, type DharaSuggestion } from "@/lib/dhara/suggestions";

type Msg = { role: "user" | "assistant"; content: string; streaming?: boolean };
type Learned = { id: string; text: string; kind: string; confidence: string };

type DharaCtx = {
  open: boolean; setOpen: (v: boolean) => void;
  messages: Msg[]; sending: boolean;
  suggestions: DharaSuggestion[]; lastLearned: Learned[];
  send: (text: string) => Promise<void>;
  runSuggestion: (s: DharaSuggestion) => void;
};

const Ctx = createContext<DharaCtx | null>(null);
export function useDhara() { const c = useContext(Ctx); if (!c) throw new Error("useDhara outside provider"); return c; }

export default function DharaProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<DharaSuggestion[]>([]);
  const [lastLearned, setLastLearned] = useState<Learned[]>([]);

  // Hydrate history once when first opened.
  useEffect(() => {
    if (!open || messages.length) return;
    fetch("/api/dhara/messages").then((r) => r.ok ? r.json() : { messages: [] })
      .then((d) => setMessages((d.messages ?? []).map((m: Msg) => ({ role: m.role, content: m.content }))))
      .catch(() => {});
  }, [open, messages.length]);

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true); setSuggestions([]); setLastLearned([]);
    setMessages((m) => [...m, { role: "user", content: msg }, { role: "assistant", content: "", streaming: true }]);
    let full = "";
    try {
      const res = await fetch("/api/dhara/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg }) });
      if (!res.ok || !res.body) throw new Error("chat failed");
      const reader = res.body.getReader(); const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value, { stream: true });
        setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: full, streaming: true }; return c; });
      }
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: full }; return c; });
      // Learn in the background; never blocks the reply.
      fetch("/api/dhara/learn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userMessage: msg, assistantMessage: full }) })
        .then((r) => r.ok ? r.json() : null).then((d) => { if (d) { setSuggestions(d.suggestions ?? []); setLastLearned(d.newlyLearned ?? []); } }).catch(() => {});
    } catch {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: "Something went quiet on my end. Try again?" }; return c; });
    } finally { setSending(false); }
  }, [sending]);

  const runSuggestion = useCallback((s: DharaSuggestion) => {
    const r = executeSuggestion(s);
    if (r) { setOpen(false); router.push(r.navigateTo); }
  }, [router]);

  return <Ctx.Provider value={{ open, setOpen, messages, sending, suggestions, lastLearned, send, runSuggestion }}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 2: Verify + commit**
```bash
npx tsc --noEmit
git add components/dhara/DharaProvider.tsx
git commit -m "feat: DharaProvider global state + streaming send"
```

---

## Task 11: DharaBar (ambient launcher + panel + route gating)

**Files:** Create `components/dhara/DharaBar.tsx`

- [ ] **Step 1: Implement**
```tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useDhara } from "@/components/dhara/DharaProvider";
import DharaConversation from "@/components/dhara/DharaConversation";

const HIDDEN_PREFIXES = ["/login", "/q/", "/welcome", "/brand-os/trial"];

export default function DharaBar() {
  const { open, setOpen } = useDhara();
  const pathname = usePathname() || "/";
  const hidden = pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen(!open); }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden, open, setOpen]);

  if (hidden) return null;

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-[var(--navy)] text-white px-4 py-3 shadow-[var(--shadow-lg)] hover:bg-[var(--navy-soft)] transition"
          aria-label="Open Dhara">
          <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />
          <span className="text-[length:var(--t-caption)] font-extrabold">Dhara</span>
          <span className="text-[10px] font-mono opacity-50">⌘J</span>
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative w-full sm:w-[420px] h-[80vh] sm:h-full bg-[var(--surface-elevated)] sm:border-l border-[var(--border)] shadow-[var(--shadow-lg)] rounded-t-[var(--r-xl)] sm:rounded-none flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <DharaConversation onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify + commit**
```bash
npx tsc --noEmit
git add components/dhara/DharaBar.tsx
git commit -m "feat: DharaBar ambient launcher + panel + route gating + hotkey"
```

---

## Task 12: DharaConversation (chat + streaming + suggestions + memory tab)

**Files:** Create `components/dhara/DharaConversation.tsx`

- [ ] **Step 1: Implement**
```tsx
"use client";

import { useState } from "react";
import { useDhara } from "@/components/dhara/DharaProvider";
import SpeakOrType from "@/components/voice/SpeakOrType";
import DharaMemoryView from "@/components/dhara/DharaMemoryView";

export default function DharaConversation({ onClose }: { onClose: () => void }) {
  const { messages, sending, send, suggestions, lastLearned, runSuggestion } = useDhara();
  const [tab, setTab] = useState<"talk" | "memory">("talk");
  const [draft, setDraft] = useState("");

  const submit = () => { const t = draft.trim(); if (!t || sending) return; setDraft(""); void send(t); };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-faint)]">
        <div className="flex items-center gap-2 font-extrabold text-[14px]">
          <span className="h-2 w-2 rounded-full bg-[var(--brand)]" /> Dhara
        </div>
        <div className="flex items-center gap-1">
          {(["talk", "memory"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${tab === t ? "bg-[var(--navy)] text-white" : "text-[color:var(--text-muted)]"}`}>
              {t === "talk" ? "Talk" : "What I remember"}
            </button>
          ))}
          <button onClick={onClose} className="ml-1 text-[color:var(--text-faint)] hover:text-[color:var(--text)] px-1.5" aria-label="Close">✕</button>
        </div>
      </div>

      {tab === "memory" ? (
        <DharaMemoryView />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">Take a breath. What's on your mind?</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] rounded-[var(--r-md)] px-3 py-2 text-[length:var(--t-body)] leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-[var(--navy)] text-white" : "bg-[var(--surface-deep)] text-[color:var(--text)]"}`}>
                  {m.content || (m.streaming ? "…" : "")}
                </div>
              </div>
            ))}
            {lastLearned.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lastLearned.map((l) => (
                  <span key={l.id} className="text-[11px] text-[color:var(--text-muted)] bg-[var(--surface-deep)] rounded-full px-2.5 py-1">✓ Remembered: {l.text}</span>
                ))}
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, i) => s.enabled ? (
                  <button key={i} onClick={() => runSuggestion(s)} className="text-[11px] font-extrabold rounded-full px-3 py-1.5 border border-[var(--brand)] text-[color:var(--brand-strong)] hover:bg-[var(--brand-soft)]">{s.label} →</button>
                ) : (
                  <span key={i} className="text-[11px] font-extrabold rounded-full px-3 py-1.5 border border-dashed border-[var(--border)] text-[color:var(--text-faint)]">{s.label} · soon</span>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-[var(--border-faint)] p-3">
            <SpeakOrType value={draft} onChange={setDraft} placeholder="Talk to Dhara, or just say it…" minRows={2} maxLength={4000} disabled={sending} />
            <button onClick={submit} disabled={sending || !draft.trim()}
              className="mt-2 w-full rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] font-extrabold text-[14px] py-2.5 disabled:opacity-40">
              {sending ? "…" : "Send"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**
```bash
npx tsc --noEmit
git add components/dhara/DharaConversation.tsx
git commit -m "feat: DharaConversation (streaming chat + suggestions + remembered)"
```

---

## Task 13: DharaMemoryView (list / confirm / edit / forget)

**Files:** Create `components/dhara/DharaMemoryView.tsx`

- [ ] **Step 1: Implement**
```tsx
"use client";

import { useEffect, useState } from "react";

type Mem = { id: string; kind: string; text: string; source: string; confidence: string };

const CONF_LABEL: Record<string, string> = { candidate: "unconfirmed", repeated: "noticed again", confirmed: "confirmed" };

export default function DharaMemoryView() {
  const [memories, setMemories] = useState<Mem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => fetch("/api/dhara/memory").then((r) => r.ok ? r.json() : { memories: [] })
    .then((d) => setMemories(d.memories ?? [])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const confirm = async (id: string) => { await fetch("/api/dhara/memory", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, confirm: true }) }); load(); };
  const forget = async (id: string) => { await fetch("/api/dhara/memory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }); setMemories((m) => m.filter((x) => x.id !== id)); };

  if (loading) return <div className="flex-1 px-4 py-6 text-[length:var(--t-caption)] text-[color:var(--text-faint)]">Loading…</div>;
  if (memories.length === 0) return <div className="flex-1 px-4 py-6 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">Nothing yet. As we talk, I'll remember what matters — and you can edit or forget any of it here.</div>;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
      {memories.map((m) => (
        <div key={m.id} className="rounded-[var(--r-md)] border border-[var(--border-faint)] px-3 py-2.5">
          <div className="text-[length:var(--t-body)] text-[color:var(--text)]">{m.text}</div>
          <div className="flex items-center justify-between mt-1.5">
            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${m.confidence === "confirmed" ? "bg-[var(--brand-soft)] text-[color:var(--brand-strong)]" : "bg-[var(--surface-deep)] text-[color:var(--text-faint)]"}`}>
              {CONF_LABEL[m.confidence] ?? m.confidence}
            </span>
            <span className="flex gap-2 text-[11px] font-bold">
              {m.confidence !== "confirmed" && <button onClick={() => confirm(m.id)} className="text-[color:var(--brand-strong)]">Confirm</button>}
              <button onClick={() => forget(m.id)} className="text-[color:var(--text-muted)] hover:text-[color:var(--danger)]">Forget</button>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**
```bash
npx tsc --noEmit
git add components/dhara/DharaMemoryView.tsx
git commit -m "feat: DharaMemoryView (confirm / forget, confidence-labeled)"
```

---

## Task 14: Mount Dhara app-wide

**Files:** Modify `app/layout.tsx`

> READ `app/layout.tsx` first. It is a server component wrapping `{children}` in `<html><body>`. Mount the client provider + bar inside `<body>` around `{children}` so Dhara is present everywhere; the bar self-hides on public routes (Task 11).

- [ ] **Step 1: Add imports + wrap children**
Add near the top:
```tsx
import DharaProvider from "@/components/dhara/DharaProvider";
import DharaBar from "@/components/dhara/DharaBar";
```
Wrap the existing `{children}` inside `<body>`:
```tsx
<DharaProvider>
  {children}
  <DharaBar />
</DharaProvider>
```
(Keep all existing body content/providers; only nest them inside `DharaProvider`. If other providers already wrap `{children}`, place `DharaProvider` as the outermost or innermost wrapper — it only needs `{children}` + `<DharaBar/>` inside it.)

- [ ] **Step 2: Verify**
```bash
npx tsc --noEmit && npx vitest run
```
Expected: clean; all tests pass (existing + new dhara unit tests).

- [ ] **Step 3: Visual check**
`npm run dev`, sign in, press ⌘J on `/command-center` → bar opens. Send "How's my month?" → reply streams, grounded in real numbers. A follow-up that names a client shows an "Open <name> →" chip. After a turn, a "✓ Remembered" chip may appear; open "What I remember" → confirm/forget works. Confirm the bar does NOT appear on `/login` or a public `/q/<slug>` page.

- [ ] **Step 4: Commit**
```bash
git add app/layout.tsx
git commit -m "feat: mount Dhara ambient bar app-wide"
```

---

## Self-Review Notes (for the executor)
- **Spec coverage:** ambient bar app-wide (T11/T14, #5); streaming (T8/T10, #8); memory ladder + provenance + edit/forget (T2/T7/T9/T13, #6); autonomy seam suggest-only (T4/T9/T12, #7); grounding on Brand OS + business snapshot + memory (T5/T8, persona T3); voice input via SpeakOrType (T12).
- **Type consistency:** `CoachMemory` defined in `lib/dhara/memory.ts` (T2) and reused by context (T5) + learn (T9). `DharaSuggestion` defined in T4, consumed by provider (T10) + conversation (T12). `DharaContext`/persona signature consistent T3↔T8.
- **Verify-at-runtime:** T1 migration applied by controller before T8/T9 hit the DB. Confirm model ids (`claude-sonnet-4-6`, Haiku id) and `userFirstName` signature against the codebase. If `getBusinessPulse` metric field names differ, align in T5.
- **De-risk option:** if streaming proves fiddly at edge, ship T8 non-streaming first (return full text), then add streaming — the client (T10) can be adapted to read a whole-body response. Keep as a fallback, not the default.
