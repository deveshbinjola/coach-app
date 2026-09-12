# Handoff — P0 "One Surface" build (2026-09-11)

Paste-ready context for continuing work on Coach Assistant in a fresh chat.
Repo: `/Users/sunnybinjola/Desktop/Jarvis/elevate-ai-project/coach-app` (deploys to
app.elevateaisystem.com via Cloudflare Pages on push; git remote
github.com/deveshbinjola/coach-app).

## North star (hard gate for every feature)
**The coach never operates software. The coach makes coach decisions.**
Product = one surface, two moments: a 90-second **Morning Brief** (email) and a
5-minute **Approval Queue** (/queue). Full product plan + mentor-panel pass:
`roadmap/p0-one-surface.md` and
`../deliverables/working-deep/coach-platform-seamless-plan.html`.

## State: ALL FIVE P0 SLICES CODE-COMPLETE, UNCOMMITTED
Everything below sits in the working tree awaiting Sunny's review. Nothing has
been committed or pushed. Sunny is the merge gate.

### Slice 1 — Morning Brief "Handled for you" (DONE)
The brief now reports what the machine did in the last 24h, not just what needs
the coach.
- `lib/ambient.ts`: new `MachineDid` type on `BusinessPulse`; pure
  `computeMachineDid()`; two new 24h queries in `getBusinessPulse`
  (cp_sequence_step_logs status=sent, cp_leads created); payments reuse the
  existing revenue-window query.
- `lib/email/daily-brief.ts`: exported `handledLines()` + "Handled for you"
  section (html + text). Never renders on zeros. Does NOT flip the anti-spam
  gate (quiet week = quiet inbox stays law; pinned by test).

### Slice 2 — Approval Queue (DONE, needs live click-through)
STEP-7 archaeology: the `auto-draft-response` edge function is real; drafts are
`cp_lead_messages` rows with `direction='draft'` (idempotent via
`uq_first_response_per_lead`). The queue is the cross-lead view.
- `lib/queue.ts`: pure `buildQueue()` + `queueCount()`. Ordering law: pending
  drafts first OLDEST first (speed-to-lead), then failed sequence enrollments,
  then content drafts.
- `app/queue/page.tsx`: server page, same auth/gate/Header idiom as
  command-center; 4 queries + one lead-name lookup.
- `components/queue/QueueView.tsx`: inline Mark-as-sent / Copy / Discard on
  draft cards, mirroring LeadDetail's FirstResponseDraftPanel transitions
  exactly (draft→outbound + lead→contacted). Two-step discard confirm.

### Slice 3 — Brief → Queue wiring (DONE)
- `lib/ambient.ts`: `decisionsWaiting` on BusinessPulse via pure
  `computeDecisionsWaiting()` (pending draft replies count + failed enrollments
  + content drafts). Definition mirrors buildQueue: the email must never
  promise decisions the screen doesn't show.
- `lib/email/daily-brief.ts`: a waiting decision flips the send gate; subject
  "2 decisions + Marcus needs you" / "One decision is waiting"; button becomes
  "Clear 2 decisions" deep-linking to /queue; summary line subsumes the
  drafts-ready bit (no fact shown twice).

### Slice 4 — Nav simplification (DONE, needs visual check)
- `components/Header.tsx`: NAV_ITEMS split into PRIMARY_NAV (Home, Queue,
  Leads, Clients) and MORE_NAV (Voice, Content, Automations) behind a "More"
  disclosure. nav-unlocks filtering, quiet-emphasis, NEW badges all preserved
  inside the menu. Reversible by moving entries between arrays.
- FINDING: there is NO mobile nav at all (pre-existing — primary nav is hidden
  below md). On mobile, the Brief email effectively IS the nav. A mobile
  surface is a future decision, not P0.

### Slice 5 — Lead-funnel instrumentation (DONE, migration APPLIED to prod)
Design: DB triggers, not app code — the queue/lead pages write cp_leads
straight from the browser, so only the DB sees every transition.
- `supabase/migrations/20260911_lead_funnel_triggers.sql`: SECURITY DEFINER
  `cp_log_funnel_event()` + triggers: cp_leads insert → lead_created; status
  change → lead_contacted/qualified/booked/became_client/closed_lost;
  cp_offering_members insert → lead_enrolled; cp_payments insert →
  payment_received. **Applied to production 2026-09-11 via MCP
  apply_migration; all 4 triggers verified in pg_trigger. Events are
  accumulating now.**
- `lib/funnel.ts`: LEAD_FUNNEL_* vocabulary + pure `computeLeadFunnel()`
  (distinct leads/stage, 30d window; unlinked payments still count).
- `lib/admin-dashboard.ts`: `leadFunnel` field + query.
- `components/command-center/admin/FunnelStrip.tsx`: "Where men fall off"
  strip on the business dashboard, beside LeadPipeline.
- NOT built on purpose: a went_quiet event (derived state, ambient scorer
  already computes it; an event would fake precision).

## Verification state
- 390 tests passing across 35 files (`npx vitest run lib/__tests__`).
- `npx tsc --noEmit` clean.
- New test files: `lib/__tests__/queue.test.ts`, `lib/__tests__/lead-funnel.test.ts`;
  extended: `daily-brief.test.ts`, `ambient.test.ts`.
- NOT yet done: live click-through of /queue, new nav, funnel strip (needs
  Sunny logged in). The 14-day Brief+Queue-only gate starts after that;
  kill check Oct 1 (if daily loop needs 3+ other screens, redesign before P1).

## What comes next (in order)
1. Sunny: review diff, click through, commit.
2. 14-day One Surface gate on Sunny's own pipeline.
3. P1 Enrollment lifecycle (cohorts, waitlists, statuses on top of
   cp_offerings) — spec in roadmap/p0-one-surface.md + seamless plan.
4. P2 Money shapes (deposit+balance, plans via existing Stripe Connect) +
   Promise/waiver e-sign. P3 alumni engine ("Men Who Stay", brotherhood
   retention metric).

## Context: the Speed / Working Deep engagement (the lab)
Sunny is applying to build the backend for Speed's Working Deep ($5-9K,
GoHighLevel as managed sub-account, Squarespace stays as storefront). Decision
already made: Speed does NOT run on Coach Assistant (young platform must not
learn money/waivers on a friend's business). GHL is the lab: every workflow
operated there by hand becomes the proven spec for P1/P2 features here (the
Carson rule: automate only what you've operated).

## Direction under discussion: the Connector thesis
Coach Assistant as the BRAIN on top of whatever CRM a coach already has
(GHL, Systeme.io, patchwork), not a replacement. Read their system → Brief +
Queue surface the decisions → coach approves → connector executes back in
their CRM. Kills the migration objection; the product category becomes "AI
chief of staff for your existing stack." GHL connector first (real REST API +
webhooks + OAuth marketplace); Systeme.io API is thin, later or via Zapier.
Sequencing: only after the P0 14-day gate passes, and read-only before
write-back. Speed's GHL sub-account is the natural first connector install.
