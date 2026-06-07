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
