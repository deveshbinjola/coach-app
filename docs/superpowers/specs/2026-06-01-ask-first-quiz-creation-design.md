# Ask-First Quiz Creation (with Voice) — Design

**Goal:** Replace the silent, auto-generating quiz creation with an "ask-first" flow: the coach tells Soma what they want the quiz to do — typed or spoken (Deepgram) — reviews the generated draft, and saves only when happy. First concrete instance of the app-wide "Soma Voice" layer.

**Architecture:** A creation modal (`QuizCreateModal`) drives a 4-state flow (ask → generating → review → save). Generation is split from persistence: `POST /api/funnels/generate` returns a draft config **without writing to the DB**; a new `POST /api/funnels/create` persists the reviewed draft. Voice input reuses the existing `VoiceMicInput` → `/api/voice/transcribe` → Deepgram stack, wrapped in a new reusable `SpeakOrType` primitive. No schema changes.

**Tech Stack:** Next.js App Router (edge), Supabase, Anthropic (Claude Sonnet 4.6, already wired in the generate route), Deepgram (already wired in `lib/brand-os/voice-discovery.ts` + `/api/voice/transcribe`), the coach-app design-token system, Vitest.

**Reference:** Visual source of truth — `docs/superpowers/mockups/2026-06-01-quiz-ask-first-creation.html`. Quiz internals live under "funnels" (`cp_funnels`).

---

## 1. Scope

**In scope (v1):**
- `SpeakOrType` reusable component (textarea + mic, returns text).
- `QuizCreateModal`: ask (brief, text + voice) → generating (breathing orb) → review draft → Save / Regenerate / Discard. "Surprise me from my Brand OS" escape hatch (empty brief).
- Split `/api/funnels/generate` to return a draft (no DB write) and accept a `brief`.
- New `POST /api/funnels/create` to persist a reviewed draft; redirect to the quiz editor on save.
- Wire `FunnelsWorkspace` "New Quiz" to open the modal instead of one-shot generating.

**Out of scope (future / north star):**
- App-wide voice command bar, navigation-by-voice, Soma talking back (TTS).
- Structured multi-question brief (who/what/offer as separate prompts) — single brief box for v1.
- Persisting the brief on the funnel row (no `creation_brief` column in v1; brief lives in client state during the session).
- Quiz types beyond `resonance`.
- The public-quiz loading fix — **already shipped** (`app/q/[slug]` now server-renders).

---

## 2. UX Flow (maps to the mockup)

1. **Ask.** Coach clicks "New Quiz" → modal opens. Headline "What do you want this quiz to do?", a `SpeakOrType` brief box (placeholder shows a concrete example), hint "Soma uses your Brand OS voice automatically", "Surprise me from my Brand OS" link, "Generate quiz" button.
   - **Voice:** tapping the mic records; on stop, Deepgram transcript is appended into the textarea. Coach can edit before generating.
2. **Generating (~4s).** Modal swaps to a calm breathing-orb state ("Building your quiz…"). The Generate button is not left frozen — the whole modal body becomes the generating state.
3. **Review draft.** The returned config renders read-only: title, subhead, the coach's brief echoed back, the 5 question stems, the 3 result chips. A "Draft" pill signals nothing is saved. Actions: **Regenerate** (returns to ask, brief preserved, editable), **Discard** (closes modal, nothing saved), **Save quiz**.
4. **Save.** `POST /api/funnels/create` persists the draft; on success the modal closes and the app navigates to `/funnels/[id]/edit` so the coach can refine. (Editor already exists.)

**Error states (in-modal):**
- No completed Brand OS → friendly panel: "Soma needs your Brand OS first to match your voice." + link to Brand OS. (The generate route already 404s this; surface it gracefully.)
- Generation/validation failure after the route's built-in retry → "That didn't come together. Try again or tweak your brief." with a Retry button. Brief preserved.
- Mic permission denied / transcription empty → handled by `VoiceMicInput`'s existing inline error; coach can still type.

---

## 3. Components

### 3.1 `SpeakOrType` (new, reusable) — `components/voice/SpeakOrType.tsx`
The reusable atom and the seed of Soma Voice.
- **Props:** `value: string`, `onChange: (v: string) => void`, `placeholder?: string`, `disabled?: boolean`, `minRows?: number`.
- **Renders:** a styled textarea + the existing `VoiceMicInput` in the footer, plus a small "Tap to talk" affordance.
- **Behavior:** `VoiceMicInput`'s `onTranscript` **appends** to `value` (space-joined if non-empty) so a coach can dictate, then type more, or dictate again. No internal state beyond what's needed; `value` is controlled by the parent.
- **Why reusable:** future surfaces (command bar, talk-to-compose) consume the same primitive.

### 3.2 `QuizCreateModal` (new) — `components/funnels/QuizCreateModal.tsx`
- **Props:** `open: boolean`, `onClose: () => void`, `hasBrandOs: boolean`.
- **Internal state:** `phase: "ask" | "generating" | "review" | "error"`, `brief: string`, `draft: GeneratedDraft | null`, `errorMsg: string | null`.
- **ask:** renders `SpeakOrType` bound to `brief`, the "Surprise me" link (sets generating with empty brief), and "Generate quiz".
- **generating:** breathing-orb state; calls `POST /api/funnels/generate` with `{ brief }`.
- **review:** renders the draft read-only + Regenerate/Discard/Save. Save → `POST /api/funnels/create` → `router.push("/funnels/" + id + "/edit")`.
- **error:** message + Retry/close; if `!hasBrandOs`, the Brand-OS-needed variant with a link.

### 3.3 `FunnelsWorkspace` (modify) — `components/funnels/FunnelsWorkspace.tsx`
- Replace `handleGenerate` (which currently POSTs to generate and prepends the result) with opening `QuizCreateModal`. Keep the empty-state and Brand-OS-gating logic. The modal owns the create lifecycle; on successful save the workspace can refresh the list (or the redirect handles it).

---

## 4. API Changes

### 4.1 `POST /api/funnels/generate` (modify) — `app/api/funnels/generate/route.ts`
- **Request body:** add optional `brief?: string` (alongside the existing optional `runId?`).
- **Behavior change:** **stop inserting into `cp_funnels`.** Instead, after generating + validating the config (and attaching branding), return the draft:
  ```ts
  return NextResponse.json({
    draft: {
      title,                      // derived as today
      type: "resonance",
      config,                     // validated FunnelConfig with branding attached
      generated_from_run_id: runId,
    },
  });
  ```
- **Prompt injection:** in the user-prompt builder, when `brief` is non-empty, prepend a clear instruction:
  > The coach described, in their own words, what they want this quiz to do: "{brief}". Make the quiz topic, questions, and results serve that intent. Still use their Brand OS voice and pillars below.
  When `brief` is empty, omit that line — preserving today's Brand-OS-only behavior (powers "Surprise me").
- Keep: rate limit, Brand OS lookup/404, branding attach, JSON validation + single retry.
- **Refactor for testability:** extract the user-prompt assembly into a pure `buildUserPrompt(brandOs, brief)` function so the brief-injection is unit-testable.

### 4.2 `POST /api/funnels/create` (new) — `app/api/funnels/create/route.ts`
- **Auth:** authed coach (server client), edge runtime, same patterns as other authed funnel routes.
- **Request body:** `{ title: string; type: string; config: FunnelConfig; generated_from_run_id?: string | null }`.
- **Validation:** re-run the same config validator used in generate (do not trust client-posted config). Reject invalid configs (400).
- **Insert:** create the `cp_funnels` row (`coach_id` = user, `published: false`, generate a unique slug as the generate route does today, attach counters defaults). Return `{ funnel: { id, slug, title } }`.
- **Why a separate route:** clean separation of "make a draft" (stateless, AI) from "commit a quiz" (stateful) — this is what kills the duplicate-spam and the "magic appeared" problem.

---

## 5. Data Model
No schema changes. `cp_funnels` already holds everything (`config` JSONB, `published`, counters, `generated_from_run_id`). Slug generation + counter defaults move from the old generate-insert into the new create route (same logic).

---

## 6. Voice Identity Note (north star, not built here)
Per `soma-identity.md`: the AI *is* the interface; two-layer Voice/Admin UX. `SpeakOrType` is deliberately the reusable primitive so the later "Universal Voice Command Bar" (captured pattern) composes from the same atom. The breathing-orb "Soma presence" visual introduced here should become the consistent voice-AI motif app-wide. This design ships the atom and the first surface only.

---

## 7. Testing
- **Unit (Vitest):** `buildUserPrompt(brandOs, brief)` includes the brief instruction when brief is non-empty and omits it when empty. Config validator rejects malformed configs (reuse/expose the existing validator).
- **Component behavior (manual against the mockup):** `SpeakOrType` appends transcripts to existing text; `QuizCreateModal` phase transitions (ask → generating → review → save), Regenerate preserves the brief, Discard writes nothing.
- **Integration (manual):** create a quiz end-to-end (type a brief, generate, review, save, land on editor); confirm no row is written until Save; "Surprise me" generates with no brief; Brand-OS-missing shows the friendly gate.

---

## 8. File Structure
```
Create:
  components/voice/SpeakOrType.tsx              # reusable textarea + mic primitive
  components/funnels/QuizCreateModal.tsx        # the 4-phase creation flow
  app/api/funnels/create/route.ts               # persist a reviewed draft
  lib/__tests__/funnel-prompt.test.ts           # buildUserPrompt brief-injection tests
Modify:
  app/api/funnels/generate/route.ts             # add brief, stop inserting, return draft, extract buildUserPrompt
  components/funnels/FunnelsWorkspace.tsx        # "New Quiz" opens QuizCreateModal
```

---

## 9. Open Questions (resolve in planning, non-blocking)
- Confirm whether a `POST /api/funnels` create route already exists (if so, extend it instead of adding `/create`).
- Confirm the slug-generation + counter-default logic in the current generate route so the create route mirrors it exactly.
- Confirm `VoiceMicInput`'s transcript callback shape (it calls `onTranscript(text)` — verified) and that `/api/voice/transcribe` works at edge for this surface.
