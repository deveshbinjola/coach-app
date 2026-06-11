# Distill eval

Measures the session-distill model (cheap, via OpenRouter) against a
hand-labeled golden set. Distill runs on the cheap model, so the harness
calls OpenRouter, not the Anthropic API.

## Run
OPENROUTER_API_KEY=... npm run eval:distill

Optional overrides: `LLM_MODEL_DISTILL` (default `google/gemini-2.5-flash`),
`LLM_MODEL_JUDGE` (default `google/gemini-2.5-flash`).

## Golden set
`eval/distill/golden.jsonl`, one JSON object per line:
- `id` — slug
- `notes` — real raw session notes
- `expected` — `{ topics, commitments, patterns, somatic }`, hand-labeled by Sunny. THIS IS THE SPEC: the `expected` set DEFINES the taxonomy.

The model must return, for every extracted item, an `evidence` field that is an
exact substring of `notes`. The deterministic layer enforces this:
evidence-must-be-substring, no em-dashes, no empty `text`.

Ship with one seed pair. Add ~10 real ones drawn from actual sessions.

## Judge calibration (do this before trusting the score)
Pick 5 pairs. Have Sunny score the model's distill 1-5 on accuracy and
prep_usefulness. Run the script and compare its judge scores to Sunny's. If
they disagree by more than ~1 point, tune the JUDGE prompt until they track.
An uncalibrated judge is theater.

- accuracy = captured the expected signals without inventing anything not in the notes.
- prep_usefulness = would this make a useful coaching-prep card.

## Gate
Exit 0 = all pass (no deterministic fails, accuracy >= 4, prep_usefulness >= 3).
Exit 1 = a regression. Run before shipping any change to the distill prompt.
