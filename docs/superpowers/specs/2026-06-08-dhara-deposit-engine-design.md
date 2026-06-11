# Dhara Deposit Engine — Design (v1: Sessions → Coaching Prep)

**Goal:** Flip the coach-app from read-at-query-time to write-on-every-event. Build one append-only signal ledger that features deposit into and a curate step that distills into the memory Dhara already reads, so the product compounds ("gets smarter over time") instead of producing exhaust. v1 proves the loop end to end on the highest-value, currently-wasted source: **coaching sessions → smarter coaching prep**.

**Architecture:** Three beats — **capture** (a saved `cp_coaching_session` is an un-distilled event), **curate** (an async, cheap-model distiller turns each new session into structured `cp_signals` rows + upserts distilled facts into `cp_coach_memory`), **brief** (a coaching-prep read surface shows last-time recap, open commitments, and forming patterns before the next session). Capture never blocks the user; curate runs on the existing cron cadence.

**Tech stack:** Next.js edge routes, Supabase Postgres (`cp_signals` new, `cp_coach_memory` extended), a new `lib/llm.ts` OpenRouter abstraction (per-task model; default Gemini Flash, Sonnet reserved for voice-fidelity drafting), Vitest, the existing `CRON_SECRET` cron pattern.

**Why this exists / the key insight:** Today only Dhara chat writes to `cp_coach_memory`; voice, Brand OS, trust, and (richest) coaching sessions deposit nothing — they're read at query time or not at all. Sessions are pure cold storage since the "just save it, no AI" change. This design **resolves that tension**: session-save stays instant and dumb; a *separate async beat* distills saved sessions into the engine. Sessions stop being exhaust without slowing the save.

---

## 1. Scope

**In (v1):**
- **`cp_signals`** append-only ledger table + RLS.
- **`cp_coach_memory` extension:** add `'session'` to the `source` CHECK so distilled session facts can live alongside chat-derived ones.
- **`lib/llm.ts`** — OpenRouter (OpenAI-compatible) call with per-task model selection. Default cheap model for distill + Dhara chat fallback.
- **The session distiller** — `app/api/cron/distill-signals/route.ts` (CRON_SECRET-guarded): find sessions with no signals yet → cheap model extracts structured signals → write `cp_signals` + `mergeOrInsert` distilled facts into `cp_coach_memory`.
- **The brief** — `getCoachingPrep(coachId, clientId)` reading `cp_signals` + `cp_coach_memory`, surfaced as a "Coaching prep" block before/at a session.
- **Migrate Dhara's chat + learn routes onto `lib/llm.ts`** (so the cheap-model swap is real and the abstraction has two consumers).
- Evals for distill quality (golden sessions → expected signals).

**Out (each its own later spec):**
- Capture from **voice / Brand OS / lead replies / trust** (the ledger is built to take them; wiring them is fast-follow).
- **Content** payoff and **post-session draft** enrichment (v1 brief is read-only prep; we do NOT re-introduce AI into session-save).
- Signal **weighting / decay** tuning beyond a static `weight` column.
- A memory/admin UI for browsing the ledger.

---

## 2. Data model

**New `cp_signals` (append-only):**
```
id          uuid pk default gen_random_uuid()
coach_id    uuid not null references auth.users(id) on delete cascade
source      text not null check (source in ('session','voice','brand_os','lead','trust'))
kind        text not null check (kind in ('topic','commitment','pattern','somatic','goal','note'))
ref_table   text not null            -- e.g. 'cp_coaching_sessions'
ref_id      uuid                     -- the source row (a session id in v1)
subject_id  uuid                     -- the client/lead this is about (cp_leads.id), nullable
payload     jsonb not null           -- { text, ... } the structured signal
weight      real not null default 1
created_at  timestamptz not null default now()
```
- RLS: `for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id)` — same pattern as `cp_coach_memory` / `cp_dhara_messages`.
- Indexes: `(coach_id, subject_id, created_at desc)` for the brief; `(coach_id, source, ref_id)` for "already distilled?" checks.
- **Append-only by convention** (no updates/deletes in app code); raw signal is never destroyed, so it can be re-mined as distillation improves.

**`cp_coach_memory` extension:** `alter ... drop constraint` + re-add `source` CHECK to include `'session'`. Everything else (kinds, confidence, status, `mergeOrInsert` dedupe) reused as-is.

**"Already distilled?" marker:** a session is distilled iff a `cp_signals` row exists with `source='session'` and `ref_id = session.id`. No schema change to `cp_coaching_sessions` needed. (Add a partial index on signals for the not-exists lookup.)

## 3. Curate — the session distiller

`app/api/cron/distill-signals/route.ts` (edge, `CRON_SECRET` via `?key=` or `Authorization: Bearer`, mirrors `cron/brand-os-digest`):
1. Service-role client. Select up to N sessions (e.g. 25/run) where no `source='session'` signal exists for `session.id`, newest first, that have `raw_notes` or `transcript`.
2. For each: call `lib/llm.ts` (cheap model) with a **distill contract** → strict JSON: `{ topics[], commitments[], patterns[], somatic[] }`, each item a short string. No invented facts; quote the coach where possible; no em-dashes.
3. Insert one `cp_signals` row per extracted item (`source='session'`, `kind` mapped, `ref_id=session.id`, `subject_id=session.client_id`, `payload={text}`).
4. Distill a small subset to durable facts: commitments → `mergeOrInsert` as `kind='goal'`; recurring patterns → `kind='fact'`, `source='session'`, `source_ref=session.id`. Reuse `parseExtraction`/`mergeOrInsert` shapes from `lib/dhara/memory.ts` where they fit.
5. Idempotent: re-running skips already-distilled sessions (the not-exists guard). Per-session failures are logged and skipped, never block the batch.
- **Trigger:** the existing scheduled cadence hits this route (same way other crons are scheduled). Batched + async ⇒ never on the user's critical path; cheap model ⇒ cost is noise.

## 4. Brief — the payoff

`lib/coaching-prep.ts` → `getCoachingPrep(supabase, coachId, clientId): Promise<CoachingPrep>`:
- `lastRecap` — top topics from the most recent distilled session for that client.
- `openCommitments` — `cp_signals` `kind='commitment'` (and `cp_coach_memory` `kind='goal'`) for that client, most recent first.
- `formingPatterns` — `kind='pattern'` signals seen ≥2× for that client.
Surfaced as a **"Coaching prep"** card on the client/session surface (e.g. `sessions/new?client=` and the client detail). Pure read; degrades gracefully to "No prior sessions yet" for new clients (slippery-slide empty state, per the copy laws).

## 5. LLM layer

`lib/llm.ts` — single OpenAI-compatible call via OpenRouter:
- `callLLM({ task, system, user, schema? })`. `task` selects the model: `'distill' | 'chat'` → cheap default (`google/gemini-2.5-flash` or `deepseek/deepseek-chat`); `'draft'` → strong (`anthropic/claude-sonnet-4-6`). Model strings live in one map, overridable by env (`LLM_MODEL_DISTILL`, etc.).
- Env: `OPENROUTER_API_KEY`, base `https://openrouter.ai/api/v1/chat/completions`. Falls back to a clear error if unset.
- Consumers in v1: the distiller + Dhara `chat` and `learn` routes (migrated off the direct Anthropic fetch). Voice-fidelity drafting routes stay on their current path until a later pass.

## 6. Privacy

`cp_signals` is per-coach, RLS `auth.uid() = coach_id`, verified live before ship (same check we ran for `cp_dhara_messages`). The distiller uses service-role but every write sets `coach_id` explicitly and is derived from the session's own `coach_id`. No cross-coach read or write path.

## 7. File structure
```
Create:
  supabase/migrations/20260608_signal_ledger.sql     # cp_signals + RLS + indexes; extend cp_coach_memory source CHECK
  lib/llm.ts                                          # OpenRouter per-task model call
  lib/llm/__tests__/llm.test.ts                       # model selection + payload shaping (pure parts)
  lib/distill/session-distill.ts                      # pure: distill contract prompt + response parser + signal mapping
  lib/distill/__tests__/session-distill.test.ts
  app/api/cron/distill-signals/route.ts               # the async distiller
  lib/coaching-prep.ts                                # getCoachingPrep + types
  lib/__tests__/coaching-prep.test.ts                 # brief assembler over fixture signals
  components/coaching/CoachingPrepCard.tsx            # the brief UI
  eval/distill/golden.jsonl                           # session -> expected signals
  scripts/eval-distill.mjs                            # distill quality eval (mirrors eval-polish)
Modify:
  app/api/dhara/chat/route.ts, app/api/dhara/learn/route.ts   # call lib/llm.ts
  (session/client surface)                            # mount CoachingPrepCard
```

## 8. Testing
- **Vitest (pure):** `session-distill` parser (clean/fenced/garbage JSON, signal mapping), `llm` task→model selection, `coaching-prep` assembler over fixture signals (recap/commitments/patterns), `mergeOrInsert` already covered.
- **Distill eval:** golden sessions → expected signal sets, LLM-judge + deterministic checks (no invented entities, no em-dash), red/green, same harness family as `eval-polish`.
- **Flow-smoke (when rails exist):** seed a session → run distiller → assert signals exist + prep returns them.

## 9. Build order (overfit one loop first)
1. Migration: `cp_signals` + RLS + `cp_coach_memory` source CHECK.
2. `lib/llm.ts` + tests (prove OpenRouter call with the cheap model).
3. `lib/distill/session-distill.ts` (pure) + tests; iterate the distill contract on ONE real session via the cron route until signals are great.
4. `app/api/cron/distill-signals` wired + idempotent; run against seeded sessions.
5. `lib/coaching-prep.ts` + `CoachingPrepCard` mounted; see the loop pay off end to end.
6. Migrate Dhara chat/learn onto `lib/llm.ts`. Distill eval + golden set.

## 10. Open questions (resolve in planning)
- Exact cheap model: `google/gemini-2.5-flash` vs `deepseek/deepseek-chat` (A/B in the eval; pick on quality-per-cent).
- Distiller batch size + cadence (start 25/run; cadence wired to the existing scheduler).
- Where exactly the `CoachingPrepCard` mounts (sessions/new vs client detail vs both) — confirm during planning against the real surfaces.
- Whether commitments should also nudge the existing follow-up/sequence system (fast-follow, not v1).
