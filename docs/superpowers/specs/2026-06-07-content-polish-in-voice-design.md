# Content Polish-in-Voice — Design

**Goal:** A coach pastes (later: speaks) a rough draft and gets it edited in their own voice. Not generated from scratch. The raw material stays theirs; the AI tightens it and hands back something postable, plus an honest summary of what it changed.

**Architecture:** One Next.js edge API route (`app/api/content/polish`) calls Anthropic once, grounded in the coach's active voice profile. All prompt/guardrail/parse logic lives in a runtime-agnostic, unit-tested `lib/content/polish-core.ts`. A standalone Polish panel in the Content area renders the result polished-forward with a one-tap "what changed" summary. An eval harness (golden set + calibrated judge + deterministic checks) is the backbone that keeps it from producing voice-drifted mush.

**Tech stack:** Next.js App Router edge route, `process.env.ANTHROPIC_API_KEY` (Cloudflare Pages env — same path as `content/draft`, `content/fix`, Dhara; NOT a Supabase Edge Function secret), `claude-sonnet-4-6`, Supabase (`cp_voice_profiles` via cookie-scoped RLS), Vitest, a Node eval script.

**First-principles spine (Karpathy):** data before prompt, evals before scale, smallest debuggable path, human always in the loop, overfit one coach then generalize. Effort weighting is deliberately ~70% golden-set + judge calibration, ~20% the Sharpen contract, ~10% UI.

---

## 1. Scope

**In (v1):**
- `app/api/content/polish/route.ts` — edge route: auth + rate-limit, load active voice profile, assemble Sharpen prompt, one Anthropic call, parse, run deterministic guardrails, return `{ polished, changes, flags, voice_version, model }`.
- `lib/content/polish-core.ts` — pure, runtime-agnostic, fully unit-tested: system-prompt builder, user-prompt builder, response parser, guardrail checks.
- `components/content/PolishPanel.tsx` — paste box → "Polish in my voice" → polished-forward result with "see what changed" (3 bullets), buttons **Use this / Try again / Copy**, steer chips on retry.
- `app/content/polish/page.tsx` + a "Polish" entry in `ContentTabBar` — self-contained, does NOT save to a library or the editorial pipeline.
- **One behavior only: Sharpen.** Tighten, cut filler, fix flow, keep ideas + voice + structure. No new ideas/facts/names/numbers.
- **Steer chips** (tighter / warmer / shorter / keep more of my words) that re-run with a one-line nudge appended.
- **Weak-voice nudge** when the active profile is a fallback / low-signal / missing.
- **Eval harness:** `eval/polish/golden.jsonl` (~20 hand-labeled pairs) + `scripts/eval-polish.mjs` (LLM judge calibrated against human ratings + the deterministic checks).

**Out (fast-follows):**
- **Voice input** (speak your draft via the existing dictation component) — v1.1. The paste box is built so the input swaps in without a rewrite.
- **Edit modes** (Light tidy / Restructure) — Sharpen-only first; modes once Sharpen is great and evaluated.
- **Saving to a content library / editorial pipeline / scheduling.**
- **`cp_content_polish_logs` table.** v1 logs metadata to edge logs only; add a table when there's a query we actually need (YAGNI).
- **Long-form chunking.** v1 caps input length and rejects oversize with a clear message.

---

## 2. The pipeline (smallest debuggable unit)

`POST /api/content/polish`
- Body: `{ raw_text: string, steer?: "tighter" | "warmer" | "shorter" | "keep_more" }`.
- Auth: `createClient()` (cookie/RLS), 401 if no user. Rate-limit via `rateLimitByUser(user.id, "content/polish", 15, 60_000)`.
- Validate `raw_text`: trim; reject `< 20` chars ("Add a bit more to work with.") and `> MAX_POLISH_CHARS` (4000) ("That's longer than v1 handles. Trim it or split it for now.").
- Load active profile: `cp_voice_profiles` where `active=true`, newest version → `{ voice_json, sample_messages, version }`.
- `system = buildSharpenSystemPrompt(voice_json, sample_messages)`; `user = buildUserPrompt(raw_text, steer)`.
- One Anthropic call (`claude-sonnet-4-6`, non-streaming, `max_tokens` sized to input).
- `parsePolishResponse(raw)` → `{ polished, changes }`. `runGuardrails(raw_text, polished)` → `flags`.
- Return `{ polished, changes, flags, voice_version, model }`. Real errors surfaced (never "non-2xx"); model/Anthropic failures return a clear message.

One input, one call, one output. Curl-able and readable. This is the core you overfit on a single draft before any UI exists.

## 3. The Sharpen contract (the prompt is the product)

`buildSharpenSystemPrompt(voiceJson, sampleMessages)` produces a system prompt that hard-constrains the edit. The contract, versioned in the repo and iterated against evals:

- You EDIT, you do not rewrite or generate. Preserve the coach's ideas, claims, and meaning exactly.
- **Add nothing new:** no facts, names, numbers, examples, or claims that are not already in the draft. (This is the anti-voice-drift rule, enforced again by guardrails.)
- Keep the coach's words and rhythm where they land. Only cut filler, fix grammar/flow, and tighten.
- **Preserve structure:** keep line breaks, lists, and bullets. A carousel script stays a script; a bulleted post stays bulleted. Do not collapse to a paragraph.
- Obey `voice_json.do_nots` and `vocabulary.avoid` (audience-correct — inherits the gender/pronoun fidelity work).
- No em-dashes. Use periods, commas, colons, parentheses.
- Output **strict JSON only**: `{ "polished": "<edited text>", "changes": ["<≤8-word bullet>", "...", "..."] }`. 2-4 change bullets, plain and specific ("cut the throat-clearing opener", "tightened the middle", "kept your closing line").

`buildUserPrompt(raw_text, steer)` wraps the draft and appends one steer line when present (e.g. `tighter` → "Lean shorter and punchier than your default."). Steering is additive nudging, never a new contract.

## 4. Output + verification UX

The model returns the change summary; **we do not compute a token diff** (heavy Sharpen edits make word-diffs unreadable, and a client diff engine is avoidable complexity). Verification is layout **C**:
- Polished result is the hero.
- "▸ see what changed" toggle reveals the 2-4 `changes` bullets and, optionally, a sentence-level before/after list (cheap, readable) — not red/green token confetti.
- Buttons: **Use this** (copies to clipboard, logs accepted), **Try again** (re-run; reveals steer chips), **Copy**.
- `flags` from guardrails render as a soft inline note ("Heads up: double-check the number here — I may have changed it."). Never blocks, never silent.

`parsePolishResponse` reuses the defensive `safeParseJson` / `extractJson` helpers from `lib/voice/extract-rules.ts` (handles fenced/loose JSON). On unparseable output: treat the whole response as `polished`, `changes: []`, and add a `flag` ("couldn't summarize the changes").

## 5. Guardrails + eval harness (evals-first)

**Deterministic checks** (`runGuardrails`, pure, instant, free) — surfaced as soft flags:
- `emDash`: an em-dash slipped into `polished`.
- `numbersAdded`: a numeric token in `polished` whose value is absent from `raw_text`.
- `ballooned`: `polished` word-count > `1.4 ×` `raw_text` word-count (Sharpen should shrink, not grow).
- `structureDropped`: `raw_text` had list/bullet/newline structure that `polished` lost.
- (No named-entity detection — not deterministically doable in this runtime. Not claimed.)

**Golden set + judge** (`eval/polish/golden.jsonl`, `scripts/eval-polish.mjs`):
- ~20 real rough drafts, each hand-labeled with an ideal polished version and notes on what "good" means. **Start with Sunny's drafts** (overfit one coach). The ideals are the spec; the Sharpen contract is derived from the gap between raw and ideal.
- LLM-as-judge scores each model output on three axes: **voice fidelity**, **faithfulness** (invented anything?), **improvement** (actually tighter?). Plus the deterministic checks.
- **Judge calibration:** before trusting the judge, verify it agrees with Sunny's human ratings on the golden set. An uncalibrated judge is theater.
- Runs red/green in the same harness family as the flow-smoke system. Gate prompt changes on it.

## 6. UI — the Polish panel

- New "Polish" entry in `ContentTabBar`; route `app/content/polish/page.tsx` renders `PolishPanel`.
- States: empty (paste box + honest one-liner), polishing (pulsing-dot button), result (layout C), error (real message read from the route's JSON `{ error }` — not the generic "non-2xx", which never applies here since this is a Next route, not a Supabase edge invoke).
- **No voice profile → gate:** "Polish writes in your voice — build it first" → `/voice`.
- **Weak voice → nudge:** if active profile has `training_signal.fallback === true` or low `interview_answers`, show a dismissible banner: "Your voice is still a starter. Refine it for sharper polish." → `/voice`.
- Input box is structured so the dictation component (`SpeakOrType`) drops in for v1.1 voice input.
- Warm-light brand palette (personal/content surface), no em-dashes anywhere in copy.

## 7. Model, cost, logging

- Model `claude-sonnet-4-6`, constant at the top of the route. Swappable (Haiku / local) without touching UI or `lib/content/polish-core.ts`.
- Cost ≈ 2-4¢ per polish. Not a constraint at this stage.
- v1 logging: `console`/edge logs of metadata only — input length, output length, steer, voice_version, model, latency, guardrail flags. No raw text, no table. Future `cp_content_polish_logs` deferred.

## 8. File structure

```
Create:
  app/api/content/polish/route.ts        # edge route: auth, load voice, call model, guardrails
  lib/content/polish-core.ts             # pure: prompt builders, parser, guardrails (unit-tested)
  lib/content/__tests__/polish-core.test.ts
  components/content/PolishPanel.tsx      # paste -> polish -> verify (layout C) + steer chips
  app/content/polish/page.tsx            # self-contained route hosting PolishPanel
  eval/polish/golden.jsonl               # ~20 hand-labeled rough->ideal pairs (start: Sunny)
  scripts/eval-polish.mjs                # judge (calibrated) + deterministic checks, red/green
  docs/qa/polish-eval.md                 # how to run evals, add golden pairs, calibrate judge
Modify:
  components/content/ContentTabBar.tsx    # add "Polish" tab
  package.json                            # "eval:polish": "node scripts/eval-polish.mjs"
```

## 9. Testing

- **Vitest** (`polish-core.test.ts`): system-prompt includes do_nots/samples; user-prompt appends steer; `parsePolishResponse` handles clean JSON, fenced JSON, and garbage (fallback path); each guardrail (emDash, numbersAdded, ballooned, structureDropped) true-positive and true-negative.
- **Eval script**: golden set runs; judge calibration step reports agreement with human labels; exits non-zero on regression.
- **Flow-smoke** (when those rails land): authed paste → polish → assert `polished` non-empty + `flags` shape.

## 10. Build order (overfit one case first)

1. Golden set: hand-label ~20 rough→ideal pairs (data before code).
2. `lib/content/polish-core.ts` + unit tests. Iterate the Sharpen contract by curling the route against ONE draft until it's great.
3. Eval script + judge calibration. Lock the contract against red/green.
4. `PolishPanel` + route/tab wiring (layout C, steer chips, gates).
5. Weak-voice nudge, guardrail flag surfacing, edge-log metadata.

## 11. Open questions (resolve in planning)

- Exact `MAX_POLISH_CHARS` (start 4000) and whether the cap is chars or words.
- Sentence-level before/after under the toggle in v1, or just the 3 change bullets? (Lean: bullets only in v1, before/after if coaches ask.)
- Golden-set storage format detail (jsonl fields: `id`, `raw`, `ideal`, `notes`).
- Judge model: same Sonnet, or a cheaper judge cross-checked on calibration?
