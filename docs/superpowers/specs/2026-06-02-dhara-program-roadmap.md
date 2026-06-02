# Dhara Program Roadmap — the 8 Karpathy improvements, tracked

A map so none of the 8 are forgotten. Each non-trivial item becomes its own spec → plan → build.

## The 8 (from the Karpathy review)
1. One spine — collapse the app toward a single loop; Dhara becomes the front door.
2. Verify-everywhere — review-before-commit on every AI output, as a reusable primitive.
3. Jargon cull — rename invented concepts to plain verbs.
4. Evals — golden-set scoring for each AI surface.
5. Ambient, not a destination — Dhara woven into screens, not a page.
6. Memory on a leash — provenance + candidate/confirmed states.
7. Autonomy slider — suggest → draft → act, as a setting not a rewrite.
8. Streaming — tokens stream; cheap background extraction.

## Track A — Dhara (the spine)
Flagship, phased. **#5, #6, #7, #8 are delivered inside Dhara v0.**
- **v0 — Talk + Remember** → spec: `2026-06-02-dhara-v0-talk-remember-design.md`. (Status: spec written.)
- v1 — Agency: turn on autonomy levels `draft` (generate → review-before-commit) then `act` (with confirm). Realizes more of #7; reuses the #2 primitive.
- v2 — Ingestion connectors: Instagram, newsletter (Beehiiv), email (Gmail) → Memory Core. Each connector its own small spec.
- v3 — TTS voice output + semantic (vector) memory retrieval when volume demands it.
- **#1 (one spine)** emerges here: as Dhara matures into the front door, run an information-architecture pass demoting other surfaces to progressive disclosure.

## Track B — App-wide UX laws
- **#2 Verify-everywhere primitive** — extract the quiz's "review-before-commit" (editable draft + warn-before-commit) into a shared `AiDraftReview` primitive; retrofit content drafts, sequence copy, follow-ups. *(Own spec; do after Dhara v0 so the pattern is proven.)*
- **#3 Jargon cull** — copy/IA audit: rename "Brand OS / funnels / resonance / pillars / sequences / command center / archetypes" toward plain verbs; keep internal terms internal. *(Own small spec; can run anytime.)*

## Track C — Evals (#4)
- **Eval harness v1** — golden sets + scoring for the two surfaces that matter now: **voice fidelity** (does generated copy honor the coach's voice DNA?) and **Dhara memory-extraction correctness** (are learned memories true, durable, non-junk?). Lands right after Dhara v0 because auto-learn isn't safe to trust without it. *(Own spec.)*
- Later: extend evals to quiz quality, follow-up quality, suggestion usefulness.

## Recommended sequence
1. **Dhara v0** (Track A) — now.
2. **Eval harness v1** (Track C) — right behind it.
3. **Verify primitive + jargon pass** (Track B).
4. **Dhara v1 agency**, then connectors; **one-spine IA** as Dhara grows.
