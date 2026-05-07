# Step 5 — Stripe Checkout for $497 + $100/mo

## What you're shipping

A Checkout flow that charges:
- **$497 one-time onboarding** (foundational setup, white-glove kickoff call, voice profile build, integrations)
- **$100/mo subscription** (platform access, AI draft credits, support)

Math at scale: 100 coaches × $100/mo = **$10K MRR**. Plus $49,700 in onboarding revenue across the cohort.

## What's in the repo

| File | Status |
|------|--------|
| `cp_subscriptions` table | ✅ APPLIED to Supabase (migration ran this session) |
| `supabase/functions/stripe-checkout/index.ts` | ✅ Code written — deploy when ready |
| `supabase/functions/stripe-webhook/index.ts` | ✅ Code written — deploy when ready |

## Manual steps in Stripe (15 min total)

### 1. Create the products (Stripe Dashboard → Products)

**Product A: Coach Platform — Onboarding**
- Name: `Coach Platform — Onboarding`
- Pricing: One time, $497.00 USD
- Copy the price ID (`price_xxx`) → save as `STRIPE_PRICE_ONBOARDING`

**Product B: Coach Platform — Monthly**
- Name: `Coach Platform — Monthly`
- Pricing: Recurring, $100.00 USD / month
- Copy the price ID (`price_xxx`) → save as `STRIPE_PRICE_MONTHLY`

### 2. Get your secret key

Stripe Dashboard → Developers → API keys → copy the `Secret key` (`sk_...`). Use the **test mode** key first.

### 3. Set Edge Function secrets

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_PRICE_ONBOARDING=price_... \
  STRIPE_PRICE_MONTHLY=price_... \
  APP_URL=http://localhost:3000 \
  --project-ref modepuhwinzdngirlnkz
```

(Or use the Supabase dashboard secrets UI: https://supabase.com/dashboard/project/modepuhwinzdngirlnkz/functions/secrets)

### 4. Deploy the two functions

The code is in your workspace. Either:

```bash
supabase functions deploy stripe-checkout --project-ref modepuhwinzdngirlnkz
supabase functions deploy stripe-webhook --no-verify-jwt --project-ref modepuhwinzdngirlnkz
```

Or ask me to deploy them via the Supabase MCP — one tool call each.

⚠️ **Important:** the webhook MUST be deployed with `--no-verify-jwt` because Stripe doesn't send JWTs. Signature verification is done in code via `STRIPE_WEBHOOK_SECRET`.

### 5. Create the webhook endpoint

Stripe Dashboard → Developers → Webhooks → **+ Add endpoint**
- URL: `https://modepuhwinzdngirlnkz.supabase.co/functions/v1/stripe-webhook`
- Events to send:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- Copy the **Signing secret** (`whsec_...`) → set as `STRIPE_WEBHOOK_SECRET` in Supabase secrets:

```bash
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... --project-ref modepuhwinzdngirlnkz
```

### 6. Add a "Subscribe" button to the app

In `app/inbox/page.tsx` or a new `app/billing/page.tsx`:

```tsx
async function startCheckout() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/stripe-checkout`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token}` },
    }
  );
  const { url } = await res.json();
  window.location.href = url;
}
```

## Test the flow end-to-end

1. Go to `/billing` (or wherever your subscribe button is)
2. Click subscribe → redirects to Stripe Checkout
3. Use test card `4242 4242 4242 4242`, any future date, any CVC
4. Stripe redirects back to `/inbox?welcome=true`
5. Check Supabase `cp_subscriptions` table — your row should be `status: active`, `onboarding_paid: true`
6. Stripe Dashboard → Webhooks → look at the latest events — all should be 200 OK

## Going to production

1. Switch to **live mode** keys in Stripe
2. Re-create products in live mode (test mode price IDs don't carry over)
3. Update Supabase secrets with live keys + price IDs
4. Update webhook endpoint to live mode endpoint (Stripe gives you a different signing secret)
5. Update `APP_URL` to your production URL

## A note on pricing

You can A/B this. Options Sunny might consider:
- $497 + $100/mo (current — qualifies for cash flow upfront)
- $0 + $147/mo (lower friction, longer payback)
- $497 only, then $147/mo after 90 days (founder's offer)
- $1,000 one-time / no monthly (lifetime access for founding 10 only)

Bias: stick with $497 + $100/mo for the founding 10. Cash up front matters and the monthly trains them to stay in the platform.
