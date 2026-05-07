# Coach Platform — agent brief

One paragraph: Voice-native AI tool for men's coaches. Positioned as "the thing that makes content actually convert," not a CRM. Voice profile is the spine. Every AI surface (auto-drafts, compose, magic moment) routes through it. Pricing $497 + $100/mo. ICP: men's coaches at $10K+/mo MRR.

## Stack
- Next.js 14 App Router (pinned, do not bump). eslint-config-next 14.2.35. eslint ^8.57.1.
- Supabase: Postgres + RLS + Edge Functions (Deno) + Auth (Google + magic link)
- Tailwind v3
- Anthropic claude-sonnet-4-6 for all generation
- Plus Jakarta Sans. Brand: #00FF41 (green) on #0A0F1C (navy) on #FAFAF8 (cream)

## Routes
- `/welcome` 4-step onboarding (hello, voice setup, magic moment with side-by-side reveal, done). Auto-redirected via middleware on first sign-in (no profile + no leads).
- `/command-center` (was `/today`). Money strip, voice trust card, just-landed AI drafts, focus queue, content pipeline.
- `/inbox` (labeled "Leads"). LeadList + Compose drawer (was `/compose`, now redirects here as `?compose=open`).
- `/voice` Single page. Native 5-question setup OR paste captions. Profile display when active. Brand OS Agent iframe is GONE.
- `/analytics` Money panel, voice trust, velocity, AI leverage, aged leads.
- `/leads/[id]` Conversation + AI draft + per-message Voice Trust badge.
- `/login` Google SSO + magic link.

## Edge Functions (all deployed)
- `voice-mine` (v4) Two modes: `{captions[]}` or `{interview[{q,a}]}`. Returns `{voice_json, sample_messages, captions_used}`.
- `voice-demo-draft` (v3) Two parallel Anthropic calls (voice + generic). Returns `{draft, generic_draft, voice_version}`. Powers the side-by-side reveal in /welcome.
- `draft-message` (v7) Per-lead reply. Loads voice profile + last 10 messages. Returns `{draft}`.
- `auto-draft-response` (v5) Fires on new lead insert. Idempotent. Skips when no voice profile, no auto-draft setting, or already drafted.
- `voice-leads-parse` Text or vision input. Extracts structured leads.
- `gmail-sync`, `stripe-checkout`, `stripe-webhook` (not the focus right now).

## Tables (all `cp_*`, RLS enforced)
- `cp_leads` (id, coach_id, full_name, email, phone, source, source_detail, temperature, pain_signal[], notes, status, next_honest_action, deal_value (cents bigint), discovery_call_completed, auto_draft_eligible, ...)
- `cp_lead_messages` (id, lead_id, coach_id, channel, direction, content, ai_drafted, sent_at, purpose, original_draft, was_edited, ...)
- `cp_voice_profiles` (coach_id, voice_json, sample_messages[], version, active). One active row per coach.
- `cp_lead_activities` Audit log.
- `cp_coach_settings` Per-coach toggles. Auto-created on first read.
- `cp_content` Content pipeline.

## Voice profile shape (`voice_json`)
```ts
{
  tone: string[];               // 3-5 specific descriptors
  sentence_rhythm: string;      // one-line cadence description
  vocabulary: { use: string[], avoid: string[] };
  openers: string[]; closers: string[]; ctas: string[];
  emotional_register: string;
  do_nots: string[];
  ig_specific?: { hook_pattern, hashtag_style, post_length };
}
```

## Hard rules (non-negotiable)
1. **Voice is the spine.** Every AI generation routes through `cp_voice_profiles`. No generic drafts in production.
2. **No em-dashes anywhere.** App UI, AI drafts, code-generated copy. Use periods, commas, colons, parentheses. System prompts include explicit "do not use em-dashes" instruction.
3. **Word-of-mouth is the design bar.** Every screen needs a moment a coach would screenshot. If nothing's screenshot-able, the screen is dead.
4. **Disruption over incremental features.** Subtract harder than competitors add. Linear / Granola / Attio / Stripe energy. Not GHL / HubSpot / Coachvox.
5. **Insights need actions.** Every insight has a button. No insight without a next step (otherwise it's theater).
6. **Money in cents** (bigint). No float drift.
7. **Honest confidence.** If N is too small to be real signal, say "preliminary" or hide the metric. Never fake a trend.

## Tailwind v3 gotchas
The single most expensive bug in this codebase is Tailwind ambiguity:
- `text-[var(--brand)]` next to `text-[var(--t-caption)]` causes ONE to be parsed as font-size and the other dropped. Always disambiguate:
  - `text-[color:var(--brand)]` for colors
  - `text-[length:var(--t-caption)]` for sizes
- This will break invisibly. If you write a button with both color and size as CSS vars, use the explicit prefixes.

## Pre-existing tsc errors (do not fix)
These are baseline, not regressions:
- `lib/supabase-server.ts`, `middleware.ts` (implicit `any` from supabase-ssr cookie types)
- `app/leads/new/page.tsx`, `components/EditLeadForm.tsx` (implicit `any` on form callbacks)
- All `supabase/functions/*` (Deno globals + jsr: imports unresolved by Next's tsc)

When type-checking, filter these out:
```bash
npx tsc --noEmit 2>&1 | grep -vE "^supabase/functions/|Cannot find name 'Deno'|Cannot find module 'jsr:|Cannot find module 'npm:|lib/supabase-server\.ts.*implicitly|middleware\.ts.*implicitly|leads/new/page\.tsx.*'any'|EditLeadForm\.tsx.*'any'"
```

## Deploy / migrations
- Supabase MCP applies migrations and deploys edge functions directly (no CLI). See `supabase/migrations/` and `supabase/functions/`.
- Frontend is Next 14 App Router. Vercel-style deploy.
- Schema changes: write migration SQL in `supabase/migrations/<date>_<name>.sql`, apply via MCP `apply_migration`.

## Signature flows to know
- **Activation (the bet):** /welcome -> 5 voice questions -> magic moment side-by-side reveal -> share affordance (PNG via Canvas API into Web Share API or download). Coach can finish in <5 min and walk away with a screenshot to send a friend.
- **Voice Trust Loop:** when a coach sends an AI-drafted message, we capture `original_draft` + compute `was_edited` (5% char-diff threshold). Drives the "% in your voice" insight on Command Center + Analytics + per-message badges. Auto-send threshold (>=90% over >=20 sends) is wired but not yet executable.
- **Compose:** lives as a near-fullscreen drawer inside /inbox. Filter leads by pain/temp/status, draft template via `draft-message`, personalize per-lead with tokens (`[FIRST_NAME]`, `[PAIN]`, etc.), log as sent.

## Just shipped (recent ground truth)
- Voice consolidation: /voice/mine merged into /voice; iframe Brand OS removed; native VoiceSetupFlow component.
- Onboarding: /welcome flow + magic moment + side-by-side reveal (`voice-demo-draft` v3).
- Voice Trust Loop: `cp_lead_messages.original_draft` + `was_edited` columns; VoiceTrustCard component on Command Center + Analytics; per-message badge in LeadDetail.
- Compose merged into /inbox as drawer; old `/compose` URL redirects.
- Side-by-side reveal: parallel API calls compare "Generic AI" vs "Your voice" with same model/prompt.
- Share affordance: Canvas API renders 1080x1500 PNG, fires Web Share API or downloads.
- Em-dash policy locked across UI and AI prompts.

## What's next (queue)
- Theatrical voice extraction + editable profile (visible processing beats, thumbs up/down on each profile field).
- Native voice INPUT (browser MediaRecorder + Whisper) for the 5 questions.
- Real-screenshot magic moment (drop a real DM screenshot via vision pipeline already shipped).
- Auto-send execution (toggle is in UI but disabled).
- Mobile audit of /welcome at 375px.
- Em-dash sweep on older surfaces (CommandCenter / Analytics / LeadDetail comments + minor strings).

## Working with Sunny
- Ship in tight loops. He says "lets go" or "ship" when ready.
- He values disruption over features. Cut things, don't add things, when in doubt.
- Visual over spreadsheets for any deliverable.
- Honest assessments over flattery. Name the cracks.

## Credentials (ref CLAUDE.md for full list)
- Supabase project: `modepuhwinzdngirlnkz`
- Anthropic key configured as `ANTHROPIC_API_KEY` in Edge Functions
