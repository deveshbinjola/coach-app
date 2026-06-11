# Dhara Deposit Engine — Design (v1: Sessions → Coaching Prep)

**Goal:** Flip the coach-app from read-at-query-time to write-on-every-event. Build one append-only signal ledger that features deposit into (through a single `depositSignal()` interface) and a curate step that distills into the memory Dhara already reads, so the product compounds ("gets smarter over time") instead of producing exhaust. v1 proves the loop end to end on the highest-value, currently-wasted source: **coaching sessions → smarter coaching prep** — and makes the compounding *visible* the moment a session is saved.

**Architecture:** Three beats — **capture** (a saved `cp_coaching_session` is an un-distilled event), **curate** (a cheap-model distiller turns each session into provenance-carrying `cp_signals` rows + upserts distilled facts into `cp_coach_memory`), **brief** (a confidence-gated coaching-prep surface shows last-time recap, open commitments, and forming patterns before the next session, each item tap-to-source and dismissible). Capture never blocks save. Curate runs **on-demand per session right after save** (non-blocking, so the deposit is felt in seconds) with a **cron sweep as backstop**.

**Tech stack:** Next.js edge routes, Supabase Postgres (`cp_signals` new via `depositSignal()`, `cp_coach_memory` extended), `lib/llm.ts` OpenRouter abstraction (per-task model; default Gemini Flash / DeepSeek for distill, Sonnet reserved for voice-fidelity drafting), Vitest, the existing `CRON_SECRET` cron pattern.

**Why this exists / key insight:** Today only Dhara chat writes to `cp_coach_memory`; sessions (richest signal) deposit nothing since the "just save it, no AI" change. This resolves that tension: session-save stays instant and dumb; a separate beat distills it. Sessions stop being exhaust without slowing the save.

---

## 1. Scope

**In (v1):**
- **`cp_signals`** append-only ledger + RLS, written **only** through `lib/signals.ts` → `depositSignal()` (so every future source reuses one interface; v1 isn't session-shaped).
- Each signal carries **provenance** — the exact source quote — so any surfaced item is traceable to the sentence it came from.
- **`cp_coach_memory` extension:** add `'session'` to the `source` CHECK.
- **`lib/llm.ts`** — OpenRouter per-task model. v1 consumer: the distiller.
- **The session distiller** — `lib/distill/session-distill.ts` (pure) + `app/api/cron/distill-signals/route.ts`. Triggered two ways: on-demand for one session right after save (felt deposit) and a `CRON_SECRET` sweep for any missed.
- **Felt deposit** — after save, the UI shows "Captured — adding to [client]'s memory…" → resolves to "N things remembered," so the coach *sees* the accrual.
- **The brief** — `getCoachingPrep(coachId, clientId)`, **confidence-gated** (only repeated/confirmed surface as commitments/patterns; single-mention = "possible," low-weight), surfaced as a push card on the client/session surface, each item **tap-to-source** and **dismissible** (→ `cp_coach_memory` `forgotten` + signal weight down).
- **Golden set + evals FIRST** — hand-distilled real sessions define the taxonomy before the schema is locked; eval covers both signal accuracy **and** prep usefulness.

**Out (each its own later spec):**
- Capture from **voice / Brand OS / lead replies / trust** (the `depositSignal()` interface is built to take them; wiring is fast-follow).
- **Migrating Dhara chat/learn onto `lib/llm.ts`** — deferred so we don't destabilize working Dhara mid-wedge. (Distiller is the first `lib/llm.ts` consumer; Dhara migrates next.)
- **Content** payoff and **post-session draft** enrichment (we do NOT re-introduce AI into session-save).
- Signal **weighting/decay** tuning beyond the `weight` column; a ledger-browsing admin UI.

---

## 2. Data model

**New `cp_signals` (append-only):**
```
id          uuid pk default gen_random_uuid()
coach_id    uuid not null references auth.users(id) on delete cascade
source      text not null check (source in ('session','voice','brand_os','lead','trust'))
kind        text not null check (kind in ('topic','commitment','pattern','somatic','goal','note'))
ref_table   text not null            -- 'cp_coaching_sessions' in v1
ref_id      uuid                     -- the source row (session id)
subject_id  uuid                     -- the client/lead this is about (cp_leads.id), nullable
text        text not null            -- the distilled signal, coach-facing
evidence    text                     -- the exact source quote it came from (provenance)
confidence  text not null default 'candidate' check (confidence in ('candidate','repeated','confirmed'))
weight      real not null default 1
status      text not null default 'active' check (status in ('active','dismissed'))
created_at  timestamptz not null default now()
```
- RLS: `for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id)`.
- Indexes: `(coach_id, subject_id, status, created_at desc)` for the brief; `(coach_id, source, ref_id)` for the "already distilled?" check.
- **Append-only by convention:** the only mutation app code performs is flipping `status` to `dismissed` (a coach correction). Raw signal is never deleted — re-mineable as distillation improves.

**`lib/signals.ts` → `depositSignal(client, coachId, signal)`** — the one write path. Validates, sets `coach_id`, inserts. Every future source calls this; nothing writes `cp_signals` directly.

**`cp_coach_memory` extension:** `alter ... drop/re-add` the `source` CHECK to include `'session'`. Distilled durable facts (commitments→`goal`, recurring patterns→`fact`) go in via the existing `mergeOrInsert`, carrying `source_ref = session.id`.

**"Already distilled?" marker:** a session is distilled iff a `cp_signals` row with `source='session', ref_id=session.id` exists. No change to `cp_coaching_sessions`.

## 3. Curate — the session distiller

**Pure core** `lib/distill/session-distill.ts`: builds the distill contract prompt and parses the model's strict JSON `{ topics[], commitments[], patterns[], somatic[] }` — each item `{ text, evidence }` (evidence = the quoted source sentence). No invented facts; obey do_nots; no em-dashes. Fully unit-tested.

**Runner** `app/api/cron/distill-signals/route.ts` (edge):
1. Auth: `CRON_SECRET` (sweep mode) OR an internal call for `?session_id=` (on-demand mode), service-role client.
2. Select sessions to distill (one for on-demand; up to 25 newest un-distilled for the sweep) that have `raw_notes`/`transcript`.
3. For each: `lib/llm.ts` (cheap model) → parsed signals → `depositSignal()` one row per item (`evidence` attached, `subject_id = session.client_id`). Commitments/patterns also `mergeOrInsert` into `cp_coach_memory`.
4. Idempotent (not-exists guard); per-session failures logged and skipped.
- **On-demand trigger:** the session-save flow fires this for the just-saved session **without awaiting** (save response stays instant). The cron sweep catches anything that failed or predates the feature.

## 4. Felt deposit (the visibility fix)

The #1 risk for a "gets smarter over time" feature is that the compounding is invisible. After a session saves, the UI immediately shows **"Captured — adding to [client]'s memory…"**, then polls/refreshes to **"Remembered: N things about [client]"** when the on-demand distill returns (seconds). The coach *sees* the deposit land. (If distill lags, the optimistic "adding…" state persists; the cron backstop guarantees eventual completion.)

## 5. Brief — the payoff

`lib/coaching-prep.ts` → `getCoachingPrep(supabase, coachId, clientId): Promise<CoachingPrep>`:
- `lastRecap` — top topics from the client's most recent distilled session.
- `openCommitments` — `kind='commitment'` signals + `cp_coach_memory` goals, **confidence ≥ repeated** to surface as a firm commitment; single-mention shows under "possible."
- `formingPatterns` — `kind='pattern'` seen ≥2× (i.e. confidence ≥ repeated).
- Excludes `status='dismissed'`.
Surfaced as a **push card** (`CoachingPrepCard`) that appears unprompted when the coach opens the client / starts a session — glanceable, ~3 bullets. Each item is **tap-to-source** (shows `evidence`: "from your session on May 12: '…'") and **dismissible** (→ flips signal `status='dismissed'` and the linked memory to `forgotten`). New client → forward-promise empty state ("Save this one and the prep writes itself for next time").

## 6. LLM layer

`lib/llm.ts` — single OpenAI-compatible call via OpenRouter. `callLLM({ task, system, user, schema? })`; `task` picks the model: `'distill'` → cheap (`google/gemini-2.5-flash` or `deepseek/deepseek-chat`, A/B in eval), `'draft'` → `anthropic/claude-sonnet-4-6`. Model strings in one map, env-overridable (`LLM_MODEL_DISTILL`). Env: `OPENROUTER_API_KEY`. Clear error if unset. v1 consumer: the distiller (Dhara migrates in a fast-follow).

## 7. Privacy

`cp_signals` per-coach, RLS `auth.uid() = coach_id`, verified live before ship. Distiller uses service-role but `depositSignal()` always sets `coach_id` from the session's own `coach_id`. No cross-coach path. `evidence` stores the coach's own session text only.

## 8. File structure
```
Create:
  supabase/migrations/20260608_signal_ledger.sql      # cp_signals + RLS + indexes; extend cp_coach_memory source CHECK
  lib/signals.ts                                       # depositSignal() — the one write path + types
  lib/__tests__/signals.test.ts                        # validation + shaping (pure parts)
  lib/llm.ts                                            # OpenRouter per-task model call
  lib/llm/__tests__/llm.test.ts
  lib/distill/session-distill.ts                       # pure: distill contract + parser (text+evidence) + signal mapping
  lib/distill/__tests__/session-distill.test.ts
  app/api/cron/distill-signals/route.ts                # on-demand (?session_id) + CRON_SECRET sweep
  lib/coaching-prep.ts                                 # getCoachingPrep + confidence gating + types
  lib/__tests__/coaching-prep.test.ts
  components/coaching/CoachingPrepCard.tsx             # push card: tap-to-source + dismiss + empty-state promise
  eval/distill/golden.jsonl                            # real sessions -> expected signals (defines taxonomy)
  scripts/eval-distill.mjs                             # signal-accuracy + prep-usefulness eval (mirrors eval-polish)
Modify:
  components/sessions/NewSessionForm.tsx (or save flow) # fire on-demand distill (non-awaited) + show felt-deposit state
  app/api/dhara/memory/route.ts                        # allow dismiss to also flip linked signal status (or new tiny route)
  (session/client surface)                             # mount CoachingPrepCard as a push card
```

## 9. Testing
- **Vitest (pure):** `depositSignal` validation/shaping; `session-distill` parser (clean/fenced/garbage JSON, text+evidence, mapping); `llm` task→model selection; `coaching-prep` assembler incl. confidence gating + dismissed exclusion over fixtures.
- **Distill eval (two levels):** (a) signal accuracy — golden sessions → expected signals, LLM-judge + deterministic checks (no invented entities, evidence is a real substring of the source, no em-dash); (b) **prep usefulness** — given a session, is the generated prep card actually helpful/faithful. Red/green, same harness family as `eval-polish`.
- **Flow-smoke (when rails exist):** seed a session → on-demand distill → assert signals + prep return them; dismiss → assert excluded.

## 10. Build order (data + evals first, then overfit one loop)
1. **Golden set first:** hand-distill ~10 real sessions; let the ideals define the signal taxonomy. Build the distill eval + judge; calibrate against human ratings.
2. Migration: `cp_signals` + RLS + `cp_coach_memory` source CHECK.
3. `lib/signals.ts` (`depositSignal`) + `lib/llm.ts` + tests.
4. `lib/distill/session-distill.ts` (pure) + tests; iterate the contract on ONE real session via the runner until signals + evidence are great (gate on the eval).
5. Distiller runner: on-demand + cron sweep; idempotent.
6. `lib/coaching-prep.ts` (confidence-gated) + `CoachingPrepCard` (push, tap-to-source, dismiss) + felt-deposit state on save. See the loop pay off end to end.

## 11. Open questions (resolve in planning)
- Cheap model: `google/gemini-2.5-flash` vs `deepseek/deepseek-chat` — A/B on the eval, pick on quality-per-cent.
- Exact mount point(s) for `CoachingPrepCard` (sessions/new vs client detail vs both) — confirm against real surfaces in planning.
- Dismiss wiring: extend `/api/dhara/memory` PATCH vs a tiny `/api/signals/dismiss` — pick the smaller change in planning.
- Sweep cadence + batch size (start 25/run; cadence on the existing scheduler).
- Where "repeated/confirmed" confidence is computed: bump `cp_signals.confidence` when the same `subject_id`+`kind`+near-duplicate `text` recurs across sessions, OR drive the brief's firmness gate off `cp_coach_memory` confidence (which already gets repeated/confirmed via `mergeOrInsert`) and treat `cp_signals` as raw evidence. Lean: the latter (no duplicate confidence logic) — confirm in planning.
