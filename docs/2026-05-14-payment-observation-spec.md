# Payment Observation — Feature Spec

**Date:** 2026-05-14
**Status:** Draft · not greenlit · build after ≥5 paying coaches ask for it
**Owner:** Sunny Binjola
**Estimated effort:** ~7 focused days
**Trigger to build:** 5+ paying coaches (post 14-day-trial) explicitly ask "where can I see revenue / payment history / MRR?" + at least one coach connects their Stripe account to a competitor product first (validates demand)

---

## The wedge in one sentence

Coaches connect their own Stripe account via OAuth → we surface payments, MRR, churn, and failed-payment alerts inside the existing Clients tab — without touching the money flow ourselves.

## Why this is observation, not processing

The instinct ("let coaches receive payments here") is right. The implementation matters.

| Process payments (we hold money flow) | Observe payments (this spec) |
|---|---|
| Touch card data → PCI compliance burden | Read-only access to coach's Stripe account |
| 2.9%+30¢ + our markup → coaches feel ripped off | Coaches keep their Stripe — no markup |
| KYC, AML, 1099-K issuance, money transmitter rules | Zero financial regulation surface |
| Chargeback / dispute support burden on us | Coach handles their own disputes in Stripe |
| ~4–6 weeks build + permanent compliance tail | ~7 days build + ongoing API maintenance |
| Stripe Atlas territory — fundamentally different business | Augments the existing coach platform thesis |

**Stripe stays the financial intermediary. We're the insight overlay.**

This is the Notion / Linear / Webflow model. None of them process their users' money. All of them surface payment context where it's useful.

---

## User story

**Coach perspective (initial setup):**

1. Coach lands on `/settings` → sees new "Stripe" card
2. Clicks "Connect Stripe" → OAuth pop-up (Stripe Connect Standard)
3. Authorizes our app to read their Stripe data
4. Backend stores `stripe_account_id` on `cp_coaches`
5. Initial sync pulls last 90 days of customers, invoices, charges, subscriptions
6. Coach lands back on the Clients tab — sees payment context appear next to client rows

**Coach perspective (daily use):**

1. Marcus pays his $500 invoice via the coach's existing Stripe payment link
2. Stripe sends webhook to our `/api/integrations/stripe/webhook`
3. We update Marcus's client room timeline: "Paid $500 · invoice INV-203"
4. If failed: client room shows red alert + drafts a follow-up email in the coach's voice
5. Coach checks `/revenue` weekly — sees MRR, churn count, top-5 LTV clients

**What the coach explicitly does NOT do here:**

- Enter credit card data
- Issue invoices from our platform (use their Stripe dashboard or templated emails)
- Handle disputes from our platform (use Stripe dashboard)
- Pay subscription/payout fees to us beyond their plan price

---

## Data model

Two new tables. `stripe_account_id` lives on `cp_coaches` (existing).

```sql
-- Coach's Stripe connection
ALTER TABLE cp_coaches
  ADD COLUMN IF NOT EXISTS stripe_account_id        text,
  ADD COLUMN IF NOT EXISTS stripe_connected_at      timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_last_synced_at    timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_account_email     text,
  ADD COLUMN IF NOT EXISTS stripe_default_currency  text;

-- Mirror of relevant Stripe data, scoped to coach. Synced on
-- webhook + periodic full refresh. Never source of truth — just a
-- read-cache for fast UI.
CREATE TABLE cp_client_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_event_id text UNIQUE,                       -- webhook idempotency key
  stripe_customer_id text NOT NULL,
  stripe_object   text NOT NULL,                     -- 'invoice' | 'charge' | 'subscription'
  stripe_object_id text NOT NULL,
  client_room_id  uuid REFERENCES cp_client_rooms(id),  -- nullable until matched
  email           text,                              -- pulled from stripe customer
  amount_cents    int NOT NULL,
  currency        text NOT NULL DEFAULT 'usd',
  status          text NOT NULL,                     -- 'paid' | 'failed' | 'refunded' | 'past_due'
  description     text,
  occurred_at     timestamptz NOT NULL,              -- when the event happened in Stripe
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, stripe_object, stripe_object_id, status)
);

CREATE INDEX cp_client_payments_coach_occurred_idx
  ON cp_client_payments (coach_id, occurred_at DESC);
CREATE INDEX cp_client_payments_email_idx
  ON cp_client_payments (coach_id, email);
CREATE INDEX cp_client_payments_room_idx
  ON cp_client_payments (client_room_id) WHERE client_room_id IS NOT NULL;

ALTER TABLE cp_client_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY cp_client_payments_owner ON cp_client_payments
  FOR ALL TO authenticated
  USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

-- MRR snapshot per day per coach. Computed from subscriptions,
-- written by a cron-like worker.
CREATE TABLE cp_revenue_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  mrr_cents     int NOT NULL DEFAULT 0,
  active_subs   int NOT NULL DEFAULT 0,
  churned_subs  int NOT NULL DEFAULT 0,
  new_subs      int NOT NULL DEFAULT 0,
  UNIQUE (coach_id, snapshot_date)
);

CREATE INDEX cp_revenue_snapshots_coach_idx
  ON cp_revenue_snapshots (coach_id, snapshot_date DESC);
```

`stripe_account_id` does NOT need encryption — it's a public Stripe identifier (their `acct_…` id). All actual API calls use our platform's Stripe secret key with that account id as the `Stripe-Account` header.

---

## API surface

```
GET    /api/integrations/stripe/status        (auth) — Is this coach connected? Last sync?
POST   /api/integrations/stripe/connect       (auth) — Initiate OAuth, returns redirect URL
GET    /api/integrations/stripe/callback      (auth) — Stripe OAuth callback, exchange code → account_id
DELETE /api/integrations/stripe/disconnect    (auth) — Revoke connection, clear stripe_account_id
POST   /api/integrations/stripe/sync          (auth) — Manual full re-sync (last 90 days)

POST   /api/integrations/stripe/webhook       (public, signature-verified) — Stripe events

GET    /api/revenue/summary                   (auth) — MRR, active subs, churn, recent payments
GET    /api/revenue/clients                   (auth) — Per-client LTV table
GET    /api/revenue/snapshots                 (auth) — Time series for MRR chart
```

**Webhook event types we listen to:**
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.finalized` (for upcoming amounts)
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `charge.refunded`

All write to `cp_client_payments` with idempotency on `stripe_event_id`.

---

## UI surfaces

### `/settings` — Stripe panel

State 1 (not connected):
```
┌─────────────────────────────────────────────────────────────┐
│  STRIPE · OBSERVATION ONLY                                  │
│                                                              │
│  Connect Stripe so payments from your clients show up       │
│  in their client room and in your revenue dashboard.        │
│                                                              │
│  · We never touch the money flow                            │
│  · You keep your existing Stripe (no migration)             │
│  · Read-only access — we can't issue refunds for you        │
│                                                              │
│              [ Connect Stripe → ]                           │
└─────────────────────────────────────────────────────────────┘
```

State 2 (connected):
```
┌─────────────────────────────────────────────────────────────┐
│  STRIPE · CONNECTED                                          │
│                                                              │
│  Account:    you@example.com (USD)                          │
│  Connected:  May 14, 2026                                   │
│  Last sync:  3 min ago · [ Sync now ]                       │
│                                                              │
│  [ Disconnect ]                                             │
└─────────────────────────────────────────────────────────────┘
```

### `/clients` — payment context per client

Each client row gets a payment badge:
- ✓ "$4,200 LTV · paid Mar 14" (green)
- ⚠ "Failed payment Mar 8" (amber, surfaces a "draft reminder" button)
- ⊖ "Subscription canceled Feb 12 · churned" (gray)

Client room timeline gets a new event type: `payment_received` / `payment_failed` / `subscription_changed`.

### `/revenue` — new top-level surface

```
┌─────────────────────────────────────────────────────────────┐
│  REVENUE                                                     │
│                                                              │
│  $8,420       $8,420 MRR · 28 active subs · 2 churned this  │
│  ↑ 12%        month · 4 new this month                       │
│                                                              │
│  [MRR chart, last 12 months, sparkline]                     │
│                                                              │
│  TOP 5 BY LIFETIME VALUE                                    │
│  Marcus Chen      $9,200 · 18 months                        │
│  Elena Park       $7,500 · 14 months                        │
│  …                                                           │
│                                                              │
│  RECENT PAYMENTS                                             │
│  May 14   Marcus C.    $500    paid                         │
│  May 13   Elena P.     $250    paid                         │
│  May 12   Sam K.       $500    FAILED · [ Draft reminder ]  │
└─────────────────────────────────────────────────────────────┘
```

---

## Stripe Connect implementation specifics

**Account type: Stripe Connect Standard** (NOT Express, NOT Custom).

Why Standard:
- Coach keeps their existing Stripe account intact
- Coach manages their own dashboard, payouts, taxes, customers
- We get read-only API access via OAuth scopes
- Zero PCI / KYC surface on our side
- No platform-level liability

OAuth flow:
1. Coach clicks "Connect Stripe"
2. We redirect to `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=…&scope=read_only&redirect_uri=…`
3. Coach authorizes
4. Stripe redirects to our `/api/integrations/stripe/callback?code=…`
5. We POST to `https://connect.stripe.com/oauth/token` with the code → get back `stripe_user_id` (the `acct_…`)
6. Store on `cp_coaches.stripe_account_id`
7. Trigger initial sync

**Subsequent API calls** all pass `Stripe-Account: acct_…` header to scope to the coach. Example:
```
GET https://api.stripe.com/v1/subscriptions?limit=100
Authorization: Bearer <PLATFORM_STRIPE_SECRET_KEY>
Stripe-Account: acct_1ABC…
```

**Webhook setup:** Single webhook endpoint on our platform. Stripe dispatches all connected accounts' events to the same endpoint. We use `event.account` to identify which coach.

---

## What's explicitly out of scope for Phase 1

- Processing payments ourselves
- Issuing invoices from our platform (coach uses Stripe dashboard for now)
- Payment links generation from our platform
- Subscription management (pause / cancel / refund) from our platform
- Refund workflow in our UI
- Tax reporting / 1099-K issuance
- Currency conversion / multi-currency dashboards (display in coach's default currency only)
- Stripe Connect Express or Custom
- Connect non-Stripe processors (Square, PayPal, etc.)
- Send-payment-link templated emails (Phase 2)
- Auto-invoicing on session completion (Phase 3)
- Revenue forecasting / ML

Resist scope creep. The unfair advantage IS that we DON'T process — we observe + surface insight. Any feature that pulls us into the money flow erodes the moat.

---

## Time breakdown

| Day | Work |
|---|---|
| **Day 1** | DB migrations (cp_coaches columns + cp_client_payments + cp_revenue_snapshots) + Stripe Connect OAuth flow (`/connect`, `/callback`, `/disconnect`) |
| **Day 2** | Initial sync logic — pull customers, invoices, subscriptions, charges via Stripe API. Match by email to cp_client_rooms. |
| **Day 3** | Webhook endpoint with signature verification + handle the 7 event types + idempotency via stripe_event_id |
| **Day 4** | `/settings` Stripe panel (connect/disconnect states) + `/clients` payment context badges |
| **Day 5** | `/revenue` surface — MRR card, sparkline chart, top-5 LTV, recent payments table |
| **Day 6** | Failed-payment automation: timeline entry in client room + AI-drafted reminder email using coach's voice DNA |
| **Day 7** | MRR snapshot cron (daily edge function), error states, deploy, end-to-end test with real Stripe test account |

**Critical-path env vars:**
- `STRIPE_CONNECT_CLIENT_ID` — from Stripe Connect settings (new)
- `STRIPE_SECRET_KEY` — already set
- `STRIPE_WEBHOOK_SECRET` — already set (or create separate one for Connect webhooks)

**Stripe dashboard setup:**
1. Enable Stripe Connect in dashboard (Platform settings)
2. Set OAuth redirect URI to `https://app.elevateaisystem.com/api/integrations/stripe/callback`
3. Create Connect webhook endpoint pointing at our webhook URL
4. Configure platform branding (coach sees "ElevateAI" during OAuth)

---

## Validation criteria — when to ship Phase 2

Phase 2 = payment-link generation + invoice templating (still using coach's Stripe). Build only if Phase 1 hits:

| Metric | Threshold | Why |
|---|---|---|
| **% of paid coaches who connect Stripe in first 14 days** | ≥50% | Adoption signal — is the feature even desired? |
| **% of connections that get a payment-related event in 30 days** | ≥70% | Activation signal — does the data actually populate? |
| **% of coaches who view /revenue ≥3x in 30 days** | ≥30% | Engagement signal — does the dashboard get used? |
| **# of "draft reminder" failed-payment actions clicked** | ≥1 per coach | Behavior signal — does the alert flow create value? |

If 3+ clear, build Phase 2 (payment link generator). If 2 or fewer, the dashboard is window dressing — back to discovery.

---

## Cohort + offer fit

| Offer | How this feature plugs in |
|---|---|
| **$7 Brand OS** | Not relevant — too early in funnel |
| **14-day platform trial** | Big "wow" moment when MRR auto-populates after Stripe connect — proof of "this is for real" |
| **$2K Augmented Cohort** | "See your real revenue inside the platform" — strong week-2 install in onboarding |
| **$12K Build Your Brand** | The "we built your whole business OS" promise — content + leads + clients + revenue in one view. Becomes literally defensible. |
| **Newsletter** | New Signal topic: "What MRR teaches you about your content strategy" — case studies |

---

## Risks & honest concerns

1. **Stripe Connect OAuth UX is fiddly.** Coaches who don't have a Stripe account need to create one first, which adds friction. Mitigation: clear "you'll need an existing Stripe account" copy on the Connect button + link to Stripe signup.

2. **Email-based matching to cp_client_rooms is imperfect.** Coach might have one client with multiple emails, or a Stripe customer with no matching client room. Mitigation: surface unmatched payments in a "needs review" queue + allow manual match.

3. **Webhook event volume.** A busy coach with many subscribers could generate hundreds of events/day. Mitigation: bulk-insert pattern + don't trigger AI reminder drafts on every single event — debounce per client per 24h.

4. **Coach data leakage risk.** If our SECRETS_MASTER_KEY rotates, we can't decrypt anything (this feature has nothing encrypted, but other features do). Document the dependency.

5. **Stripe API rate limits.** Initial sync of a coach with 5+ years of history could hit Stripe's 100 req/sec ceiling. Mitigation: paginate cursor-based + chunk by 90-day windows + show a "syncing... ~2 min" progress in UI.

6. **No invoicing path = coaches still leave the platform to send invoices.** This is the gap Phase 2 closes. Accept it for v1.

7. **Multi-currency.** If a coach has clients paying in EUR, GBP, USD, the MRR number gets weird. Phase 1: display in coach's `default_currency` only; convert non-matching at sync time using fixed daily rate; surface a note. Phase 2: real multi-currency support.

---

## Open questions to answer before building

1. **Should `stripe_account_id` be encrypted?** It's a public-ish identifier (similar to a Twitter handle), but does it warrant the same treatment as BYOK Resend keys? My read: no, it's not a secret. Leave plain.

2. **Initial sync depth.** Last 90 days vs full history? My recommendation: 90 days default with "Sync all history" button as escape hatch.

3. **Subscription pause/cancel UX.** Should we surface "Pause subscription" inside our UI, or always deep-link to Stripe dashboard? My recommendation: deep-link always. Keeps us out of the money flow.

4. **Failed-payment reminder email — sent through coach's BYOK Resend or platform Resend?** My recommendation: coach's BYOK Resend if connected (sends from their domain), else platform Resend as fallback. Already the pattern.

5. **Webhook secret rotation.** If we rotate the Stripe webhook secret, existing connected coaches keep working (Stripe re-signs with new secret automatically). Confirm this assumption with a test.

6. **Disconnect cleanup.** When a coach disconnects, do we keep the synced data or delete it? My recommendation: keep — they paid for the insight. Add `stripe_disconnected_at` timestamp instead of nulling everything.

---

## Build-ready checklist

- [ ] Validation gate cleared (5+ paying coaches asking for revenue/MRR)
- [ ] Open questions above answered
- [ ] Stripe Connect application submitted + approved (this can take 1–2 weeks)
- [ ] Test Stripe account set up for Connect testing
- [ ] Sprint scheduled (7 focused days)
- [ ] Webhook signing secret configured in Cloudflare env
- [ ] OAuth redirect URI registered with Stripe Connect

Spec frozen here until those check off. Stripe Connect approval is the slow step — start that 1 week before the sprint kickoff so it doesn't block.
