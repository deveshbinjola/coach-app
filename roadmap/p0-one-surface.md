# P0 — One Surface

North star (hard gate for every slice): **the coach never operates software; the coach
makes coach decisions.** Full plan + mentor-panel pass:
`../deliverables/working-deep/coach-platform-seamless-plan.html`.

Success metric: Sunny runs his own coaching pipeline for 14 straight days touching ONLY
the Morning Brief and the Approval Queue.
Kill criterion: if by Oct 1 the daily loop still needs 3+ other screens, stop and
redesign the surface before building P1 (enrollment lifecycle).

## Slices

### 1. Morning Brief: "Handled for you" — DONE (2026-09-11)
The brief previously only said what needs the coach; now it also says what didn't.
- `lib/ambient.ts`: `MachineDid` type + `computeMachineDid()` (pure) + two 24h queries
  (`cp_sequence_step_logs` status=sent, `cp_leads` created) in `getBusinessPulse`;
  payments reuse the existing revenue-window query, filtered in the pure fn.
- `lib/email/daily-brief.ts`: `handledLines()` (pure, exported) + "Handled for you"
  section in html + text. Never renders on zeros; does NOT flip the anti-spam gate
  (`hasSomethingToSay` untouched — quiet week, quiet inbox stays law).
- Tests: `lib/__tests__/daily-brief.test.ts`, `lib/__tests__/ambient.test.ts` (48 pass).

### 2. Approval Queue as the second moment — BUILT (2026-09-11, pending live check)
Archaeology confirmed STEP-7 is real: `auto-draft-response` edge function inserts
first-response drafts as `cp_lead_messages` rows with `direction='draft'`
(idempotent via `uq_first_response_per_lead`); LeadDetail's FirstResponseDraftPanel
already held the per-lead approve mechanics. The queue is the cross-lead view:
- `lib/queue.ts` — pure `buildQueue()` + `queueCount()`. Ordering law: pending
  drafts first, OLDEST first (speed-to-lead), then stalled enrollments, then
  content drafts. Tests: `lib/__tests__/queue.test.ts`.
- `app/queue/page.tsx` — server page (auth + onboarding gate + Header, same idiom
  as command-center), four queries + one lead-name lookup, hands rows to buildQueue.
- `components/queue/QueueView.tsx` — inline Mark-as-sent / Copy / Discard on draft
  cards, mirroring FirstResponseDraftPanel's exact state transitions
  (draft→outbound + lead→contacted). Two-step discard confirm, no modal.
Not yet verified against live data in a logged-in browser — do that before calling
the slice done.

### 3. Brief → Queue wiring — DONE (2026-09-11)
- `lib/ambient.ts`: `decisionsWaiting` on BusinessPulse via pure
  `computeDecisionsWaiting()` (pending draft replies count query + failed
  enrollments + content drafts already fetched). Definition mirrors
  lib/queue.ts buildQueue — the email must never promise decisions the
  screen doesn't show.
- `lib/email/daily-brief.ts`: decisions flip the anti-spam gate (a decision
  IS something that needs the coach); subject "2 decisions + Marcus needs
  you" / "One decision is waiting"; button deep-links to /queue ("Clear 2
  decisions") when decisions wait, /command-center otherwise; summary line
  subsumes the drafts-ready bit so no fact shows twice.
- Tests: 59 passing across brief/ambient/queue.

### 4. Nav simplification — DONE (2026-09-11, pending visual check)
`components/Header.tsx`: NAV_ITEMS split into PRIMARY_NAV (Home, Queue, Leads,
Clients — the daily loop) and MORE_NAV (Voice, Content, Automations) behind a
"More" disclosure pill. The More button lights active when a folded section is
the current page; nav-unlocks filtering, quiet-emphasis dimming, and NEW badges
all moved inside the menu intact. Fully reversible — move an entry between the
two arrays. Note: there is no mobile nav at all (pre-existing; primary nav is
hidden below md) — a mobile surface is its own future decision, not part of P0.
Not yet eyeballed in a logged-in browser.

### 5. Funnel event instrumentation — CODE DONE (2026-09-11), MIGRATION NOT APPLIED
Design decision: DB triggers, not app code — the queue and lead pages write
cp_leads straight from the browser, so only the database sees every transition.
- `supabase/migrations/20260911_lead_funnel_triggers.sql`: SECURITY DEFINER
  logger fn + triggers on cp_leads (insert → lead_created; status change →
  lead_contacted/qualified/booked/became_client/closed_lost), cp_offering_members
  (insert → lead_enrolled, coach via offering + lead via room), cp_payments
  (insert → payment_received; lead linkage TODO when the table carries one).
  APPLIED to production 2026-09-11 via MCP apply_migration; all four triggers
  verified present in pg_trigger (leads insert, leads status, offering members,
  payments). Events accumulate from this moment.
- `lib/funnel.ts`: LEAD_FUNNEL_* vocabulary + pure computeLeadFunnel()
  (distinct leads per stage, 30d window, unlinked payments still count).
- Admin dashboard: `leadFunnel` on AdminDashboard + FunnelStrip ("Where men
  fall off") next to LeadPipeline. Quiet explainer until events accumulate.
- Tests: lib/__tests__/lead-funnel.test.ts. Suite: 390 passing.
- Deliberately NOT built: a "went_quiet" event — quietness is a derived state
  the ambient scorer already computes; logging it as an event would fake
  precision.

## P0 status: all five slices code-complete (2026-09-11)
Outstanding before P0 is DONE: Sunny's live click-through (/queue, new nav,
admin funnel strip), the trigger migration applied, and then the real gate:
14 days of Sunny running his own pipeline on Brief + Queue alone. Kill check
Oct 1 per the plan.

## Notes
- Speed/Working Deep build runs on GHL as the lab; workflows proven there become the
  spec for P1/P2 (see seamless plan §7). Do not build speculative features here.
- No commits without Sunny's review; he is the merge gate (self-healing runbook rule).
