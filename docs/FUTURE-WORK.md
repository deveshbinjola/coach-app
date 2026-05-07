# Future Work — Coach Platform

Living parking lot for ideas we've thought through but aren't building right now. Each item has the *why* and the *when to revisit* so future-you isn't starting from a cold read.

**How this doc works:** Add items as they surface. Don't worry about priority here — when it's time to pick something up, we prioritize against whatever's actually happening in the business. The value of this file is *preserved context*, not ranking.

**Last updated:** 2026-04-23 (after P4: fit scoring + objection handling)

---

## Lead generation — Apollo integration

**Context:** The CRM currently tracks leads that come in organically (IG, referrals, quiz, in-person). No active outbound pipe. Apollo is already installed as a plugin with `apollo:prospect`, `apollo:enrich-lead`, and `apollo:sequence-load` skills; credentials are wired. The strategic call we've made is that prospects ≠ leads — cold Apollo-sourced contacts should live in a separate quarantine until they reply, or they'll wreck conversion metrics on the main dashboard.

**The 80/20 starting point (when we come back to this):**
1. "Enrich this lead" button on lead detail — takes an existing lead, calls `apollo_people_match`, populates title/company/LinkedIn/phone. Immediately sharpens the P4 fit score because company size hints at income band.
2. "Find similar" button on strong-fit clients — seed from a closed client, run `mixed_people_api_search` with extracted signals (title keywords, company size, industry), return 20-50 lookalikes in a slide-over, one-click add as prospects.

These two buttons validate "does Apollo data actually match my ICP?" in a weekend, before we commit to building the full prospecting surface.

**Full build (after validation):**
- New table: `cp_prospects` (separate from `cp_leads`). Schema mirrors lead basics + Apollo IDs + enrichment timestamp + prospect status (new / sequenced / replied / promoted).
- `/prospect` page — ICP input in plain English → `apollo:prospect` runs → ranked results table → bulk select → save as prospects.
- Promotion flow: prospect replies → one-click promote to `cp_leads` with `source='apollo'` and `source_detail='<campaign name>'`. This makes Apollo-sourced replies show up in the attribution block so we can compare conversion vs. IG/referral.
- Sequence push via `apollo:sequence-load` — but only after deliverability guardrails (see below).

**What Apollo is good at / weak at for our ICP:**
- **Strong:** Coaches who've built a real business — LLC, 1-10 employees, "Professional Training & Coaching" industry tag, founders. Skews toward $2K cohort fit more than $12K flagship.
- **Weak:** Solo IG-native creators, audience-driven coaches without a company entity, anyone whose buying intent is emotional/timing-based rather than business-trigger-based.

**Guardrails before we ship cold outreach:**
- Credit budget — cap "Find similar" at N results/click, cache lookalike sets for 30 days, track Apollo spend per prospect sourced.
- Deliverability — cold sequences go from a warmed-up secondary domain, *never* `elevateaisystem.com`. One bad sequence can nuke sender reputation for months.
- Reply-first cadence — short, personal, question-led. No "just following up" spam.

**When to revisit:** When organic lead volume is the bottleneck, not conversion. Right now P1–P4 is sharpening the book we already have. Once we see the fit score predict closes reliably (P4's conversion-by-band chart turning green for strong-fit), then outbound makes sense because we'll know what to filter Apollo results against.

---

## SLA split — "waiting on them" vs. "we owe reply"

**Context:** Deferred from the P2 (Nurture re-warm + inbound logging) sprint. Current SLA treats all overdue threads the same way. In reality there are two distinct states:

1. **We owe them a reply** — last message was inbound, clock is on us. Overdue = bad, we're dropping the ball.
2. **Waiting on them** — last message was outbound, clock is on them. Overdue ≠ bad; it just means time to re-engage with the RewarmDeck.

Right now the `SlaBadge` doesn't distinguish, which means the /today view can scream at the coach about threads where we're not actually the blocker.

**What to build:**
- Inspect the most recent message direction per lead. If `last_message.direction === 'inbound'`, SLA is "we owe" — tighter threshold, louder UI.
- If outbound, SLA is "they owe" — looser threshold, softer UI, trigger RewarmDeck at the warning edge.
- Two badge variants. Two distinct counters on /today.

**When to revisit:** Right after P5 ships, or sooner if you catch yourself ignoring the SLA badge because it cries wolf.

---

## Voice drift detection + Brand OS re-training loop

**Context:** `voice_profiles` table exists with a single active profile per coach. It's set once (via Brand OS Agent onboarding) and then static. But your voice evolves as your book evolves — the way you talked to leads in Q1 2026 probably doesn't match how you're talking to them in Q3. If voice stays frozen, AI drafts start sounding like last year's you.

**What to build:**
- Periodic job (weekly?) that samples your last 50 outbound messages — the ones the coach actually *sent*, not AI drafts. Feeds back into the Brand OS Agent's voice extractor.
- Diff the new voice signature vs. the active profile. If the drift is significant, prompt the coach: "Your voice has shifted — re-train?"
- Preserves the 4-step Brand OS flow (Avatar → Voice → Content Pillars → 30-45 days content) as the retraining surface, not a new UI.

**Why it matters:** The whole wedge of this product vs. generic CRMs is "AI drafts in *your* voice." If voice decays, that wedge dulls. This is the defensive moat, not a feature.

**When to revisit:** Once you've been using the draft-message Edge Function for 2-3 months and have a corpus of sent messages to work with. Premature otherwise.

---

## Objection tracking — close the feedback loop on P4

**Context:** We shipped the objection pattern library and ObjectionDeck in P4. Coaches can draft reframes in one click. But we don't track *which* reframes get used, and we don't know which reframes actually move deals. Right now objection-patterns.ts is static tribal knowledge — it doesn't learn.

**What to build:**
- New table: `cp_objection_events` (lead_id, pattern_id, used_at, outcome_at_close). Logs every time "Use this reframe" is clicked.
- On deal close (status → client OR closed_lost), attribute outcome to the last N objection events in that thread.
- Analytics pane: which patterns get used most? Which pattern→outcome combos actually win? Which patterns never get used (dead weight to remove)?
- Eventually: coach can edit pattern text inline when one needs tuning. Moves patterns from static library to live-updated.

**When to revisit:** Once P4 has real usage data — need at least 30-50 objection events to see signal. Otherwise analytics are noise.

---

## Client success / post-purchase loop

**Context:** The whole CRM ends at `status: 'client'`. After someone buys, we stop tracking them — but that's exactly when they become your biggest asset (renewal, upsell, referral). The $12K flagship has a 2-3 month arc; the $2K cohort is 8 weeks. Both need structured touchpoints during and after delivery.

**What to build:**
- New lead-status values: `client_onboarding`, `client_active`, `client_graduating`, `client_alumni`. Or a parallel `client_lifecycle` field so it layers cleanly on top of the existing pipeline.
- "Check-in cadence" — scheduled prompts based on lifecycle stage (week 2: how's the work landing? week 6: what's shifting? week 12: who should we send next?).
- Referral-ask automation at the graduation stage — this already has the `referral_ask` rewarm pattern from P3; just needs to fire on a schedule, not on SLA drift.
- NPS-style pulse survey at graduation — feeds future testimonials + voice training data.

**When to revisit:** When you have enough active clients that keeping them in a spreadsheet or your head stops working. Probably after 10-15 active.

---

## Multi-coach platform (the 100+ coach vision)

**Context:** Current Supabase setup is single-coach via RLS (`coach_id = auth.uid()`). This works for Founding 10 and probably the first cohort of coaches. But the strategic thesis is "100+ coach platform at $10K+ MRR" — at that scale, the product needs team features, org-level billing, role-based access, shared templates, and probably a "Head Coach" tier.

**What to think through (not build yet):**
- Data model: `organizations` table, coaches as members of an org, RLS becomes `org_id = user.org_id`.
- Shared voice profiles at org level vs. individual — do head coaches set a house voice that individuals inherit and adapt?
- Shared templates: objection patterns, rewarm sequences — are these org-level or per-coach?
- Billing: Stripe Customer = org, not individual coach. Seat-based pricing?
- Permissions: who can see whose leads? Full transparency vs. walled gardens?

**When to revisit:** When the 3rd or 4th coach starts asking "can my VA log in?" or "can I share templates with another coach?" That's the demand signal.

---

## Deeper analytics — conversion funnel + cohort curves

**Context:** The dashboard today shows point-in-time metrics (fit band distribution, source mix, top content hits). What it doesn't show is *time-series* funnel behavior: how long does a strong-fit lead typically take to close? What's the drop-off at each stage (new → contacted → discovery → client)? Are Q2 leads closing faster than Q1?

**What to build:**
- Cohort curves — leads grouped by acquisition month, tracked through each status over time.
- Funnel breakdown with median days-at-stage per source / per fit band.
- "What's different about closed-lost vs. client?" auto-comparison — finds the signals that diverge (income band, source, pain signal, readiness).

**When to revisit:** Once you have 60-90 days of real lead data. Before then the time series is too noisy to read.

---

## Bulk actions + keyboard shortcuts on /inbox

**Context:** LeadList is already 5-column with bulk pain signal edit. But common workflows like "tag 10 leads with dormant status," "set next_honest_action to 'send_resource' on all cold leads," or "disqualify these 3 tire-kickers" still need individual edits. Keyboard-first UX would make the coach's daily work 3x faster.

**What to build:**
- Bulk select + bulk edit for: status, temperature, next_honest_action, pain_signal, discovery_call_completed, disqualified_reason.
- Keyboard shortcuts: j/k navigate, e edit, x select, d disqualify, c compose.
- "Select all matching filter" — if filtered to dormant leads, shift-click selects the whole filter set.

**When to revisit:** When you catch yourself doing the same 10-click operation repeatedly. Volume forces the need.

---

## Apollo-adjacent — LinkedIn Sales Navigator integration

**Context:** Apollo is the obvious first integration, but LinkedIn Sales Navigator data is structurally different and arguably better-suited for the coach ICP (individuals, not companies). Sales Nav shows job changes, content activity, connection graph — all of which map cleanly to "who's in a transition that makes them a candidate for coaching."

**What to think through:**
- Official Sales Nav API access is gated; most integrations are scraper-based (fragile, ToS-risky).
- Alternative: Phantombuster / Bright Data have coach-friendly scraping products, but cost stacks up.
- Minimum-viable approach: manual export + `/leads/import` flow (already supports ZIP, CSV). Coach does Sales Nav search once a week, exports, imports. Zero integration complexity.

**When to revisit:** If Apollo turns out to be a bad fit for the ICP (solo creators, IG-native coaches). LinkedIn is the natural fallback.

---

## Ideas we're explicitly NOT doing

Parked here so they don't come back as "oh we should build X":

- **Full email sending from inside the CRM** — the draft-message flow intentionally stops at "log as sent." Coach sends from their real email client. Reason: deliverability is hard, and coaches build reply habits with real email. v2 can revisit once scale demands it.
- **Native mobile app** — the web app is mobile-responsive; that's enough. Native eats roadmap for a decade.
- **AI that auto-sends without review** — every AI draft is coach-reviewed and coach-sent. This is a product principle, not a v1 limitation. The voice is yours, the send button is yours.
- **Lead scoring ML model** — `lib/lead-score.ts` and `lib/lead-fit.ts` are deterministic and transparent on purpose. Coaches can see exactly why a lead scored what it scored and override their gut. ML would hide that. Revisit only when you have 10,000+ leads and deterministic weights stop scaling.

---

## How to add items to this doc

When something comes up that we want to remember but aren't building:
1. Pick a bucket above (or start a new one — don't over-organize).
2. Write the context in 2-3 sentences. The *why*, not just the *what*.
3. Sketch what the build looks like (doesn't have to be complete).
4. Write the "when to revisit" trigger — what has to be true before this becomes worth doing?

The trigger matters more than the description. A good trigger means you won't ship this prematurely or forget it forever.
