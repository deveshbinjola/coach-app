# Dhara v0 — Ambient "Talk + Remember" Design

**Goal:** Give the coach an ambient AI companion ("Dhara") woven into every screen: they talk to it (type or voice), it answers in a grounded-guide personality grounded in their Brand OS + live business state + a growing memory, its replies stream, and it quietly learns durable, editable memories from every conversation.

**Architecture:** A global `DharaProvider` + ambient bar mounted in the authed layout (present everywhere, expands in place — no destination page). A streaming `POST /api/dhara/chat` proxies Anthropic streaming, grounded by `lib/dhara/context.ts` (Brand OS synthesis + a compact business snapshot reusing `getBusinessPulse` + the coach's memories + recent turns). After each turn, `POST /api/dhara/learn` distills memories on a fast/cheap model into a new `cp_coach_memory` store with provenance + a confidence ladder (candidate → repeated → confirmed). An **autonomy seam** (`lib/dhara/suggestions.ts`) is built now but fixed at "suggest."

**Tech Stack:** Next.js App Router (edge), Supabase, Anthropic (Sonnet 4.6 for chat streaming; Haiku/cheap model for extraction), Deepgram (already wired via `SpeakOrType`/`VoiceMicInput`), design-token system, Vitest.

**Karpathy principles baked in:** ambient-not-destination (#5), memory on a leash w/ provenance + candidate/confirmed (#6), autonomy slider as a seam (#7), streaming + cheap background extraction (#8). The app-wide laws (#1 one-spine, #2 verify-everywhere primitive, #3 jargon cull) and #4 evals are tracked in `docs/superpowers/specs/2026-06-02-dhara-program-roadmap.md` as their own projects.

---

## 1. Scope

**In (v0):**
- Global ambient Dhara bar (launcher + in-place conversation panel) on every authed screen; type or voice input (reuse `SpeakOrType`).
- Streaming chat replies in the grounded-guide persona, grounded in Brand OS + business snapshot + memory + recent turns.
- **Memory Core** (`cp_coach_memory`): auto-learned + explicit memories, each with kind, provenance, confidence (candidate/repeated/confirmed), status (active/forgotten).
- "What Dhara remembers" view: list grouped by confidence, with provenance, edit + forget, and confirm-a-candidate.
- Conversation persistence (`cp_dhara_messages`); recent turns load into context.
- **Autonomy seam**: replies may carry structured suggestions; v0 executor only *displays* them and performs safe *navigation* — never drafts or acts.

**Out (later Dhara phases / other tracks):**
- TTS voice *output* (Dhara speaking).
- Real draft/act execution (autonomy levels beyond "suggest").
- Ingestion connectors (Instagram, newsletter/Beehiiv, email/Gmail).
- Semantic/vector memory retrieval (v0 loads all active memories).
- Multi-thread conversations; team/multi-coach.

---

## 2. The Autonomy Seam (#7) — built now, dialed to "suggest"

A single type defines every action Dhara can ever propose:

```ts
type DharaSuggestion = {
  level: "suggest" | "draft" | "act";   // the slider; v0 only emits "suggest"
  kind: "navigate" | "compose" | "create" | "note";
  label: string;                          // "Open hot leads", "Draft a check-in for Marcus"
  href?: string;                          // for navigate (safe in v0)
  payload?: Record<string, unknown>;      // for draft/act later
};
```

A client `executeSuggestion(s)` switch handles levels. **v0 implements `navigate` only** (push to an href) and renders `compose`/`create` as **disabled "coming soon" chips** so the seam is visible but inert. Later phases light up `draft` (generate → review-before-commit) and `act` (with confirm). No silent action ever.

---

## 3. Data Model

Two new tables (migrations applied via Supabase MCP).

**`cp_coach_memory`** — the growing memory:
```sql
create table public.cp_coach_memory (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fact','preference','goal','audience','voice_note')),
  text text not null,
  source text not null check (source in ('conversation','explicit','brand_os')),
  source_ref text,                       -- message id / "you said" / run id (provenance)
  confidence text not null default 'candidate'
    check (confidence in ('candidate','repeated','confirmed')),
  status text not null default 'active' check (status in ('active','forgotten')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.cp_coach_memory enable row level security;
create policy "coach owns memory" on public.cp_coach_memory
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);
create index cp_coach_memory_active on public.cp_coach_memory (coach_id, status, confidence);
```

**`cp_dhara_messages`** — conversation log:
```sql
create table public.cp_dhara_messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.cp_dhara_messages enable row level security;
create policy "coach owns dhara messages" on public.cp_dhara_messages
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);
create index cp_dhara_messages_recent on public.cp_dhara_messages (coach_id, created_at desc);
```

---

## 4. Memory lifecycle (#6 — the leash)

- **Capture:** after each exchange, `POST /api/dhara/learn` sends the user+assistant turn to a cheap model with a strict extraction prompt → returns 0–3 candidate memories `{kind, text}`. Junk/ephemera explicitly excluded by the prompt.
- **Dedup + promote:** normalize each candidate's text; if it matches an existing active memory (case/space-insensitive, or trivial fuzzy), bump that memory `candidate → repeated → (stays)` and update `last_seen_at` instead of inserting. New text inserts as `candidate`.
- **Confidence semantics in context (#6):** when building the prompt, memories are labeled — `confirmed`/`repeated` stated as known facts; `candidate` injected as *"(unconfirmed, do not assert as fact)"* so a wrong auto-memory can flavor understanding but never gets parroted as truth.
- **Explicit:** if the user says "remember that…" (detected in the chat route or via a candidate flagged explicit), store as `confirmed`, source `explicit`.
- **Provenance:** every memory keeps `source` + `source_ref` + timestamps; the memory view shows "learned from your chat on {date}".
- **Forget/edit:** the memory view PATCHes text/confidence or sets `status='forgotten'` (soft delete; never hard-deleted in v0 so it can be audited).
- **Retrieval (v0):** load all `status='active'` memories (cap 200, order confidence desc, last_seen desc). No embeddings — YAGNI until volume demands it.

---

## 5. Context assembly — `lib/dhara/context.ts`

`getDharaContext(coachId, now)` returns a compact, prompt-ready bundle:
- **identity** — from latest `cp_brand_os_runs.synthesis_json` (avatar, voice DNA, pillars), read live, trimmed.
- **business snapshot** — reuse `getBusinessPulse(coachId, now)` (lighter than the full dashboard): revenue + trend, who's slipping (heroItem/quietList reasons), drafts waiting, sessions. A few lines, not the whole object.
- **memories** — active memories, confidence-labeled (see §4).
- Latency note: `getBusinessPulse` is one `Promise.all`; acceptable per turn. Do NOT call the heavier `getAdminDashboard` per message.

---

## 6. Persona — `lib/dhara/persona.ts`

Pure `buildDharaSystemPrompt(ctx)` composing:
- **Voice:** grounded guide — calm, spacious, somatic, few words that land; mirrors back; slows the coach down. Speaks like a seasoned men's-work facilitator, not a chatbot.
- **Identity guardrails:** amplify, never originate the coach's voice; the coach decides, Dhara serves; embodied, not corporate; never pretend the AI is the transformation. No em dashes (house rule). No hype.
- **Grounding rules:** use the identity + snapshot + memories provided; never invent business numbers; treat `candidate` memories as unconfirmed; if unsure, ask one clean question rather than guess.
- **Suggestion rule:** when an action would help, emit a `DharaSuggestion` (suggest-level) rather than doing it.

Versioned as a constant so it can be eval'd later (Track C).

---

## 7. API

- **`POST /api/dhara/chat`** — body `{ message }`. Persists the user message, assembles context, calls Anthropic with `stream:true`, and pipes the token stream to the client (edge `ReadableStream`). On stream end (server side), persists the assistant message. Returns the stream; the assistant text is also captured server-side for persistence.
- **`POST /api/dhara/learn`** — body `{ userMessage, assistantMessage }`. Cheap-model extraction → dedup/promote/insert into `cp_coach_memory`. Returns `{ newlyLearned: Array<{id, text, kind, confidence}> }` so the UI can show a soft "Dhara remembered: …". Called by the client right after the stream completes (keeps streaming simple; extraction never blocks the reply).
- **`GET /api/dhara/memory`** — list active memories (grouped/sorted). **`PATCH`** — edit text / set confidence=confirmed. **`DELETE`** (or PATCH status) — forget.
- **`GET /api/dhara/messages`** — recent conversation (for hydrating the panel).

All authed (server client), edge runtime, rate-limited per user.

---

## 8. UI — ambient bar (#5) + streaming (#8)

- **`DharaProvider`** (React context) mounted in the authed layout: holds open/closed state, message list, send(), and exposes `executeSuggestion`. One instance, app-wide.
- **`DharaBar`** — the ambient launcher: a small docked control (and a `⌘K` / `⌘J` hotkey) on every authed screen. Click/hotkey expands a calm conversation panel *in place* (overlay/sheet), not a route change. Reuses the existing global-overlay approach (`lib/brand-os/voice-overlay.ts` pattern).
- **`DharaConversation`** — message list with **streaming** assistant text (render tokens as they arrive); input is `SpeakOrType` (type or mic). Soft "remembered" affordance after a turn. Suggestion chips render via the seam (navigate active; compose/create disabled "soon").
- **`DharaMemoryView`** — toggle within the panel: "What Dhara remembers," grouped by confidence, each row showing text + provenance + confirm/edit/forget. Candidates visually softer than confirmed.
- Styling: spacious, breathing, the Dhara mark; matches the grounded-guide tone.

---

## 9. Files

```
Create:
  supabase/migrations/<ts>_dhara_memory_and_messages.sql
  lib/dhara/persona.ts            # buildDharaSystemPrompt (pure)
  lib/dhara/memory.ts             # types + extraction prompt + dedup/promote logic (pure parts)
  lib/dhara/context.ts            # getDharaContext (brand os + getBusinessPulse + memories)
  lib/dhara/suggestions.ts        # DharaSuggestion type + executeSuggestion (v0: navigate only)
  lib/__tests__/dhara-persona.test.ts
  lib/__tests__/dhara-memory.test.ts
  app/api/dhara/chat/route.ts     # streaming reply
  app/api/dhara/learn/route.ts    # extraction → memory
  app/api/dhara/memory/route.ts   # GET/PATCH/DELETE memories
  app/api/dhara/messages/route.ts # GET recent conversation
  components/dhara/DharaProvider.tsx
  components/dhara/DharaBar.tsx
  components/dhara/DharaConversation.tsx
  components/dhara/DharaMemoryView.tsx
Modify:
  app/(authed layout file)        # mount DharaProvider + DharaBar app-wide
```

---

## 10. Testing
- **Unit (Vitest):**
  - `buildDharaSystemPrompt` includes the guardrails, contains no em dashes, and labels `candidate` memories as unconfirmed while stating `confirmed` as fact.
  - Memory dedup/promote: identical normalized text bumps `candidate → repeated` (not a duplicate insert); novel text inserts as `candidate`; explicit path yields `confirmed`.
  - Extraction parsing: malformed model output yields zero memories (never throws).
  - `executeSuggestion`: `navigate` returns an href action; `compose`/`create`/`act` are inert in v0 (no execution).
- **Manual:** ambient bar opens via hotkey on multiple screens; reply streams; "remembered" appears; memory view edit/forget/confirm works; candidate vs confirmed visibly different; business question ("how's my month?") answers from the snapshot; refresh keeps memory + recent convo.

---

## 11. Open Questions (resolve in planning)
- Exact authed layout file to mount the provider/bar (confirm the root layout that wraps all signed-in screens).
- Anthropic streaming shape at edge (SSE event parsing) — confirm the app's Anthropic version supports `stream:true` and pick the cheap extraction model (Haiku vs gpt-4o-mini).
- Reuse vs adapt `lib/brand-os/voice-overlay.ts` for the global overlay.
- "Remember that…" detection: simple phrase trigger in the chat route vs. letting the extractor flag `explicit` — pick one (lean: extractor flags it).
