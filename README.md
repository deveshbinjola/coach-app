# Coach App — ElevateAI Coach Platform

The Next.js frontend for coaches. Talks to Supabase (already provisioned: project `modepuhwinzdngirlnkz`) and to the `draft-message` Edge Function for AI-drafted replies in the coach's voice.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** with brand tokens (#00FF41 green, #0A0F1C navy)
- **Supabase** (Postgres + Auth + Edge Functions)
- **Anthropic Claude** for voice-matched drafting

## Quick start (local)

```bash
cd coach-app
cp .env.local.example .env.local         # fill in keys
npm install
npm run dev                              # http://localhost:3000
```

Then run STEP-1-AUTH-SETUP.md (3 minutes in Supabase dashboard) so magic links work.

## Routes

| Path | Purpose |
|------|---------|
| `/login` | Magic link form |
| `/auth/callback` | Exchanges code for session |
| `/inbox` | Lead list, sorted by next followup |
| `/leads/new` | Add lead form |
| `/leads/[id]` | Lead detail + conversation + AI draft |

## Auth

Middleware redirects unauthenticated users to `/login`. The first time a user signs in, the `cp_handle_new_user` trigger creates a `cp_coaches` row automatically (run STEP-1B SQL).

## RLS

Every query auto-filters by `coach_id = auth.uid()` via Postgres RLS. Frontend code never adds a manual filter — the backend enforces it.

## Deploying

- **Vercel** (easiest): `vercel --prod` — env vars from `.env.local`
- **Cloudflare Pages**: `npm run build` then upload `.next` (or use `@cloudflare/next-on-pages`)
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the host's env. Anthropic + Stripe secrets only live as Edge Function secrets.

## Going from MVP → real

- v1 (today): manual lead entry, AI draft, manual send
- v1.5: webhook from quiz funnel auto-creates `cp_leads`
- v2: send via Resend (email) and IG/LinkedIn DM connectors
- v3: realtime collab via Supabase Realtime channels
- v4: VA seat — invite a virtual assistant with limited RLS scope per coach

## Pair this with

- **draft-message** Edge Function — `supabase/functions/draft-message/`
- **stripe-checkout** Edge Function — `supabase/functions/stripe-checkout/`
- **stripe-webhook** Edge Function — `supabase/functions/stripe-webhook/`
- **STEP-1-AUTH-SETUP.md** — dashboard config
- **STEP-1B-AUTO-PROVISION-COACH.sql** — auto-create cp_coaches row on signup
