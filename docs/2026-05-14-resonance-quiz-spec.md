# Resonance Quiz — Feature Spec

**Date:** 2026-05-14
**Status:** Draft · not greenlit · build after $7 trial flow validates
**Owner:** Sunny Binjola
**Estimated effort:** ~5 focused days
**Trigger to build:** ≥10 Brand OS runs completed in production + at least 3 buyers convert from $7 → 14-day platform trial

---

## The wedge in one sentence

A 5-question quiz funnel auto-generated from the coach's Brand OS — built in 30 seconds, branded with their kit, hosted under our domain, captures leads into their existing inbox.

## Why this is different from Typeform / Interact / ScoreApp

| Generic quiz tool | Resonance Quiz |
|---|---|
| Blank canvas. Coach writes questions, scoring, results. | AI reads the coach's Brand OS and generates everything. |
| 4–8 hours to build one quiz. | 30 seconds. |
| Generic templates. | Personalized per coach — their pillars become the result archetypes. |
| Quiz lives on quiz-tool branded domain. | Quiz lives at `app.elevateaisystem.com/q/[slug]`. |
| Captures email to a list. | Captures email AS a lead row in the coach's existing inbox. |
| Charged per response. | Included in plan. |

The unfair advantage is the existing `cp_brand_os_runs.synthesis_json` — every Brand OS completer already has the inputs needed to generate a quiz. No setup screen. No question wizard. Just "Generate."

---

## User story

**Coach perspective:**

1. Coach completes Brand OS (existing flow)
2. On their deliverable page, a new card appears: **"Turn this into a quiz funnel."**
3. They click → 30 seconds later, a draft quiz is generated:
   - 5 questions, each tied to one of their pillars
   - 3 result archetypes (one per pillar)
   - Result page copy in their voice
   - Email-capture step before showing the result
   - Final CTA pointing to their `funnel.q1` destination
4. They review, optionally edit copy, click **Publish**
5. Coach gets a shareable URL: `app.elevateaisystem.com/q/[their-slug]`
6. They paste it in their IG bio, newsletter, LinkedIn
7. Every completion creates a `cp_leads` row tagged `source: 'funnel'` with the result archetype in `tags`
8. Coach replies to those leads through their existing inbox flow — the brand voice overlay already drafts the response

**Visitor perspective (the quiz-taker):**

1. Lands on the quiz URL
2. Sees the coach's brand kit (colors, font, logo)
3. Question 1 of 5 — multiple choice, one per screen
4. Progress bar at top
5. After Q5: "Enter your email to see your result" (email capture)
6. Result page: "You're a [Archetype] type" + a paragraph of pillar-specific insight + the coach's CTA
7. Optional: "Share your result" buttons (just shareable copy + URL)

---

## Data model

Two new tables.

```sql
-- Each coach can have multiple quiz funnels (typically 1 active, others archived).
CREATE TABLE cp_funnels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug            text NOT NULL UNIQUE,           -- e.g. "marcus-honest-money"
  type            text NOT NULL CHECK (type IN ('resonance', 'diagnostic', 'path_picker')),
  title           text NOT NULL,                  -- public-facing quiz title
  config          jsonb NOT NULL,                 -- questions + result archetypes (see shape below)
  published       boolean NOT NULL DEFAULT false,
  view_count      int NOT NULL DEFAULT 0,
  start_count     int NOT NULL DEFAULT 0,         -- visitors who began Q1
  complete_count  int NOT NULL DEFAULT 0,         -- visitors who saw result
  email_count     int NOT NULL DEFAULT 0,         -- visitors who gave email
  generated_from_run_id uuid REFERENCES cp_brand_os_runs(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cp_funnels_coach_idx ON cp_funnels (coach_id, created_at DESC);
CREATE INDEX cp_funnels_slug_idx  ON cp_funnels (slug);

ALTER TABLE cp_funnels ENABLE ROW LEVEL SECURITY;
CREATE POLICY cp_funnels_owner ON cp_funnels
  FOR ALL TO authenticated
  USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

-- One response per quiz completion. Lead row in cp_leads gets created
-- in parallel via the public submit endpoint.
CREATE TABLE cp_funnel_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id       uuid NOT NULL REFERENCES cp_funnels(id) ON DELETE CASCADE,
  coach_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers         jsonb NOT NULL,                 -- [{ q_id, choice }, ...]
  result_key      text NOT NULL,                  -- which archetype they got
  email           text,
  lead_id         uuid REFERENCES cp_leads(id),
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cp_funnel_responses_funnel_idx ON cp_funnel_responses (funnel_id, created_at DESC);
ALTER TABLE cp_funnel_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY cp_funnel_responses_owner ON cp_funnel_responses
  FOR ALL TO authenticated
  USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
```

### `cp_funnels.config` jsonb shape

```jsonc
{
  "intro": {
    "headline": "What's your brand archetype?",
    "subhead":  "5 questions. ~60 seconds. Get a personalized read on how you show up.",
    "cta_label": "Start"
  },
  "questions": [
    {
      "id": "q1",
      "text": "When a client first comes to you, what are they actually looking for?",
      "choices": [
        { "key": "a", "text": "Clarity on what they're stuck on", "scores": { "pillar_1": 2, "pillar_2": 0, "pillar_3": 0 } },
        { "key": "b", "text": "Permission to slow down",         "scores": { "pillar_1": 0, "pillar_2": 2, "pillar_3": 0 } },
        { "key": "c", "text": "A direct plan to execute",         "scores": { "pillar_1": 0, "pillar_2": 0, "pillar_3": 2 } }
      ]
    }
    // … 4 more questions
  ],
  "results": [
    {
      "key": "pillar_1",
      "pillar_name": "Honest Money",         // pulled from Brand OS
      "headline": "You're a Truth-Teller.",
      "body": "[Coach's voice DNA, vocab_yes preferred. 2-3 sentences naming what this type wrestles with + what unlocks them]",
      "cta_text": "[funnel.q3 'required belief' or the coach's offer line]",
      "cta_url": "[whatever the coach pasted as their primary CTA destination]"
    }
    // … 2 more, one per pillar
  ],
  "branding": {
    "primary_hex":    "#00FF41",   // from cp_coach_settings.brand_primary_hex
    "accent_hex":     "#00CC34",
    "background_hex": "#0A0F1C",
    "font_family":    "Fraunces"
  }
}
```

---

## API surface

```
POST   /api/funnels/generate       (auth) — Read Brand OS synthesis → return draft config
POST   /api/funnels                 (auth) — Create funnel row with given config
PATCH  /api/funnels/[id]            (auth) — Update config / publish
GET    /api/funnels/[id]/responses  (auth) — Paginated responses for analytics
DELETE /api/funnels/[id]            (auth) — Archive

POST   /api/funnels/public/[slug]/view     (public) — Increment view_count
POST   /api/funnels/public/[slug]/submit   (public) — Accept answers + email, return result_key
GET    /api/funnels/public/[slug]          (public) — Read-only config for the public page
```

Public endpoints have **no auth** but rate-limit by IP (existing `rateLimitByUser` helper, keyed by IP for anonymous).

---

## UI surfaces

### Coach side (authenticated)

- **`/funnels`** new top-level nav item (between Content and Leads)
  - Empty state: "Generate your first quiz from your Brand OS" CTA
  - List of funnels with stats (views, completions, email captures, conversion %)
- **`/funnels/new`** — generate flow: pick type (Resonance for v1), click Generate, see preview, click Publish
- **`/funnels/[id]`** — edit + stats
  - Inline question editor (text-only — no add/remove in v1; lock the structure)
  - Result page editor (copy-only)
  - Branding overrides
  - Live preview iframe of the public quiz page
  - **Analytics:** view→start→complete→email funnel + recent responses list

### Public side (no auth, no cookies)

- **`/q/[slug]`** — quiz landing page
  - Renders coach's brand kit
  - Question stepper (one at a time, like Brand OS itself)
  - Email gate before result
  - Result page with CTA
  - Server component, edge runtime, cacheable

---

## Brand OS → Quiz generation prompt

The `/api/funnels/generate` endpoint sends this to Claude Sonnet 4.6 with the coach's full synthesis_json:

```
You are generating a 5-question Resonance Quiz funnel for a coach. The
quiz segments visitors into 3 archetypes — one per pillar from the
coach's Brand OS.

INPUT: The coach's Brand OS synthesis (positioning, voice DNA, pillars,
buyer mirror, signature line).

OUTPUT: Strict JSON matching the cp_funnels.config schema:
- intro.headline: a curiosity hook in the coach's voice register
- 5 questions, each with 3 multiple-choice answers
  - Each answer scores 0–2 toward exactly ONE of the 3 pillars
  - Question style: situational ("When X happens, what do you do?") not
    abstract ("Are you a hard worker?")
  - Use coach's vocab_yes; avoid vocab_no
  - Address the named buyer mirror in second person where natural
- 3 results, one per pillar:
  - headline: "You're a [archetype name]."
  - body: 2-3 sentences in the coach's voice tying the pillar to what
    this type wrestles with + what unlocks them
  - cta_text + cta_url: pulled from funnel.q1 (one destination) +
    funnel.q3 (required belief)

QUALITY BAR:
- Questions must be specific to this coach's pillars, not generic
- Result body must read like the coach wrote it (vocab_yes, signature
  moves observed in synthesis)
- NO coach jargon: transformation, unlock, level up, thrive
- NO em dashes
```

The endpoint validates the JSON shape, regenerates once if invalid, returns to the client. ~$0.02–0.04 per generation at Sonnet 4.6.

---

## What's explicitly out of scope for Phase 1

- Branching logic (different next-question based on previous answer)
- Custom scoring formulas
- More than 5 questions
- More than 3 results
- Multi-page funnels (intro page → quiz → sales page)
- A/B test variants
- Webhook/Zapier output
- Custom domains (coach's own URL)
- Image-based answers
- Drag-and-drop question reorder
- Quiz embed widget for external sites
- The other 2 funnel types (Diagnostic, Path-Picker)

Resist scope creep. The unfair advantage IS the constraints — 5 questions, 3 results, all generated from Brand OS, hosted on our domain. Any feature that loosens those constraints reduces the moat.

---

## Time breakdown

| Day | Work |
|---|---|
| **Day 1** | DB migrations + `/api/funnels/generate` endpoint with Anthropic call + JSON validation |
| **Day 2** | `/api/funnels` CRUD + public `/api/funnels/public/[slug]/submit` with cp_leads insert |
| **Day 3** | `/funnels` nav surface — list view + new/edit pages + live preview iframe |
| **Day 4** | `/q/[slug]` public page — question stepper, email gate, result rendering, brand kit application |
| **Day 5** | Analytics view (funnel chart + responses list), polish, error states, deploy |

**Critical-path env vars (already set):** `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, brand-kit env (none needed; reads from `cp_coach_settings`).

---

## Validation criteria — when to ship Phase 2

Phase 2 = Diagnostic + Path-Picker funnel types. Build them only if Phase 1 hits these in production:

| Metric | Threshold | Why |
|---|---|---|
| **% of Brand OS completers who generate a quiz** | ≥40% | Adoption signal — are coaches even interested? |
| **% of generated quizzes that get published** | ≥60% | Quality signal — is the AI output good enough to ship as-is? |
| **Median responses per published quiz in first 30 days** | ≥15 | Distribution signal — are coaches actually sharing the URL? |
| **% of responses that become qualified leads** | ≥30% | Conversion signal — is the lead row useful for the coach's pipeline? |

If 3+ of those clear, build Diagnostic next. If 2 or fewer, the wedge isn't pulling — re-evaluate.

---

## Cohort + offer fit

| Offer | How this feature plugs in |
|---|---|
| **$7 Brand OS** | "Bonus: when you finish, get a personalized quiz funnel for free." Raises perceived value. |
| **$2K Augmented Cohort** | Week-1 ship: every cohort coach publishes their quiz. Early viral loop — they share each other's. |
| **$12K Build Your Brand** | Done-with-you funnel build. We have the tooling now to actually deliver this promise. |
| **Newsletter** | New Signal topic: "The 5-question quiz that beat 6 months of content." |

---

## Risks & honest concerns

1. **AI generation quality.** Quizzes that read generic will tank the moat. Mitigation: tight system prompt + manual eyeball-test on first 10 generations + a "Regenerate" button.
2. **Public traffic vector.** `/q/[slug]` is public — could be a target for spam submissions. Mitigation: simple per-IP rate limit + email validation. No CAPTCHA in v1.
3. **Scope creep pressure.** Coaches will immediately ask for "can it also do X?" Resist. The 5-question constraint is the product.
4. **Cannibalization of marketing site quiz.** `elevateaisystem.com` already runs a quiz funnel toward Brand OS. This new feature is for the COACHES' quizzes, not ours. Don't conflate.

---

## Open questions to answer before building

1. **Slug format.** `marcus-honest-money` vs `m-7K2pX` vs both (coach picks)?
2. **Branding parity.** Should the quiz page include "Powered by ElevateAI" in the footer? (Yes for free tier, removable on paid?)
3. **Custom domains.** Out of scope for v1, but is this a $X/mo upsell later or part of the standard plan?
4. **Response export.** CSV download for coaches who want to push to Mailchimp / Beehiiv manually?
5. **Result-page social sharing.** Specific OG image generation per archetype (hot move) or default OG (cheap)?

Decide these in the 1-day discuss phase before sprint kickoff.

---

## Build-ready checklist

- [ ] Validation gate cleared (≥10 Brand OS completions in prod)
- [ ] Open questions above answered
- [ ] Sprint scheduled (5 focused days)
- [ ] First-10-generations review plan in place (Sunny eyeballs each one)
- [ ] Analytics dashboard for the 4 validation metrics built BEFORE the feature ships

Spec frozen here until those check off. Don't start the migration until the checklist clears.
