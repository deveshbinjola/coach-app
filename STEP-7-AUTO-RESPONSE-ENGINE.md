# Step 7 — Auto-Response Engine

The single feature that turns Coach Platform from "another CRM" into "the only tool that makes coaches 21x more likely to close." Voice-native first-response in <5 minutes, automatic, no compromise on personalization.

## The promise

> The moment a lead lands — from any source — Coach Platform drafts a personalized response in the coach's voice within 30 seconds. The coach reviews in 60 seconds and hits send. Total elapsed time: 2-4 minutes vs. industry-typical 24 hours. The voice is theirs (Brand OS spine). The leverage is ours (AI + the right pipeline).

**Success metric:** average first-response time per coach drops from days to <10 minutes within 30 days of activation.

## Why this is the right move

- **The only acquisition feature where Coach Platform beats GoHighLevel.** GHL has auto-responders — they're robotic, generic, "Thanks for reaching out!" trash. Your Brand OS voice spine is the moat. Nobody else can do voice-authentic auto-response.
- **It rides on infrastructure that already exists.** Voice profile (`cp_voice_profiles`), AI drafter (Edge Function `draft-message`), lead inbox (`cp_leads`). We're connecting three things, not building from scratch.
- **It works with any capture tool.** Tally, Typeform, IG DM, Gmail, native Coach Platform form, webhook from anywhere — Coach Platform sits behind whatever they use.
- **It produces a brag metric.** "Average first-response time: 3 minutes" becomes the sales line.

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│  LEAD ARRIVES (any source)                                        │
│   ├─ Form submission  ─┐                                          │
│   ├─ Webhook (Tally)  ─┤                                          │
│   ├─ Gmail email sync ─┼──> INSERT INTO cp_leads                  │
│   ├─ Native form      ─┤    (status='new', auto_draft_eligible=t) │
│   └─ Manual /leads/new┘                                           │
│                                  │                                │
│                                  ▼                                │
│            ┌─────────────────────────────────────┐                │
│            │  Postgres trigger: on_new_lead      │                │
│            │  fires pg_net.http_post →           │                │
│            │  Edge Function `auto-draft-response`│                │
│            └─────────────────────────────────────┘                │
│                                  │                                │
│                                  ▼                                │
│            ┌─────────────────────────────────────┐                │
│            │  Edge Function: auto-draft-response │                │
│            │  1. Loads coach's active voice      │                │
│            │  2. Builds context (lead source,    │                │
│            │     pain signals, source_detail,    │                │
│            │     fit, notes)                     │                │
│            │  3. Calls Anthropic with            │                │
│            │     purpose='first_response'        │                │
│            │  4. Inserts cp_lead_messages row    │                │
│            │     direction='draft', ai_drafted=t │                │
│            │  5. Triggers notification email     │                │
│            └─────────────────────────────────────┘                │
│                                  │                                │
│                                  ▼                                │
│            ┌─────────────────────────────────────┐                │
│            │  Coach sees on /today:              │                │
│            │  ✨ Just landed (3) — drafts ready  │                │
│            │  Reviews → 1-click send → done      │                │
│            └─────────────────────────────────────┘                │
└───────────────────────────────────────────────────────────────────┘
```

## Database changes

### 1. Extend `cp_leads`

```sql
alter table cp_leads
  -- True for "live" sources (form/webhook/email/manual single-add); false for
  -- bulk imports (CSV) so we don't auto-draft 500 messages on a Notion ZIP import.
  -- Default true for safety; ImportWizard explicitly sets false on bulk insert.
  add column auto_draft_eligible boolean not null default true;
```

### 2. Extend `cp_lead_messages`

```sql
alter table cp_lead_messages
  -- Why was this draft generated? Lets us prompt the model differently for
  -- first-response vs. follow-up vs. rewarm vs. ad-hoc.
  add column purpose text check (purpose in (
    'first_response',  -- the auto-response engine
    'follow_up',       -- continuing an active conversation
    'rewarm',          -- reactivating a silent lead
    'ad_hoc'           -- coach-initiated draft from Compose
  )),
  -- For dedupe + Gmail integration. We don't want two auto-drafts for the
  -- same lead at the same purpose, and we want to be able to map back to
  -- Gmail message IDs once that integration is live.
  add column external_id text,
  add column synced_from text;

-- Prevent duplicate first-response drafts per lead. If the trigger fires
-- twice (idempotency, retries), the second insert is a no-op.
create unique index uq_first_response_per_lead
  on cp_lead_messages (lead_id, purpose)
  where purpose = 'first_response' and direction = 'draft';
```

### 3. New table: `cp_coach_settings`

We've been deferring this. Time to add it. Stores coach-level toggles, including the auto-draft on/off switch.

```sql
create table cp_coach_settings (
  coach_id uuid primary key references auth.users(id) on delete cascade,
  auto_draft_on_new_lead boolean not null default true,
  auto_draft_email_notification boolean not null default true,
  reach_target_per_week int not null default 15,
  -- Future: timezone, business hours, AI guardrails, etc.
  updated_at timestamptz not null default now()
);

-- RLS: each coach can read/write their own settings.
alter table cp_coach_settings enable row level security;
create policy "coach reads own settings" on cp_coach_settings
  for select using (auth.uid() = coach_id);
create policy "coach writes own settings" on cp_coach_settings
  for all using (auth.uid() = coach_id) with check (auth.uid() = coach_id);

-- Auto-create row on first read so we don't have to handle missing rows
-- everywhere. Triggered by a function called from the app on first login.
```

Migrate the existing user_metadata.reach_target_per_week into this table once it's live.

## The trigger

```sql
-- Postgres trigger that fires the Edge Function when a "live" lead arrives.
create or replace function trigger_auto_draft_response()
returns trigger
language plpgsql
security definer
as $$
declare
  fn_url text := current_setting('app.settings.auto_draft_function_url', true);
  service_key text := current_setting('app.settings.service_role_key', true);
begin
  -- Only fire for live sources where auto-draft is wanted.
  if new.auto_draft_eligible and new.status = 'new' then
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('lead_id', new.id, 'coach_id', new.coach_id)
    );
  end if;
  return new;
end;
$$;

create trigger on_new_lead_auto_draft
  after insert on cp_leads
  for each row
  execute function trigger_auto_draft_response();
```

The function URL and service role key live in Postgres settings (`alter database ... set app.settings.auto_draft_function_url = '...'`) — no secrets in the trigger body itself.

## Edge Function: `auto-draft-response`

New function (sibling to existing `draft-message`). Lives at `supabase/functions/auto-draft-response/index.ts`.

```ts
// Pseudocode — actual file follows the patterns in draft-message/index.ts

serve(async (req) => {
  const { lead_id, coach_id } = await req.json();

  // 1. Check coach's settings. Bail if they've turned auto-draft off.
  const settings = await getCoachSettings(coach_id);
  if (!settings.auto_draft_on_new_lead) return new Response("ok (skipped)");

  // 2. Skip if a first_response draft already exists (idempotent).
  const existing = await supabase
    .from("cp_lead_messages")
    .select("id")
    .eq("lead_id", lead_id)
    .eq("purpose", "first_response")
    .eq("direction", "draft")
    .maybeSingle();
  if (existing.data) return new Response("ok (already drafted)");

  // 3. Load lead + coach voice in parallel.
  const [lead, voice] = await Promise.all([
    getLead(lead_id),
    getActiveVoiceProfile(coach_id),
  ]);

  // 4. Build the prompt context — different from follow-up because there's
  //    no conversation history. We use the lead's signal (source, pain,
  //    notes, source_detail) to ground the response.
  const context = buildFirstResponseContext(lead, voice);

  // 5. Call Anthropic. Use the same prompt scaffolding as draft-message but
  //    with a 'first_response' purpose flag so the system prompt branches.
  const draft = await callAnthropic({
    voice,
    purpose: "first_response",
    context,
    maxTokens: 600,  // first responses should be short, not essays
  });

  // 6. Insert as a draft. Unique index prevents duplicates.
  await supabase.from("cp_lead_messages").insert({
    lead_id,
    coach_id,
    channel: "email", // default; coach can change
    direction: "draft",
    purpose: "first_response",
    content: draft,
    ai_drafted: true,
  });

  // 7. Fire notification email if enabled.
  if (settings.auto_draft_email_notification) {
    await sendDraftReadyEmail({ coach_id, lead });
  }

  return new Response("ok");
});
```

### Prompt scaffolding for first_response

The model sees:

```
SYSTEM:
You are drafting [Coach Name]'s first response to a brand-new lead.
[Coach's voice profile: tone, sentence_rhythm, vocabulary, openers, closers,
ctas, do_nots — full Brand OS voice spine]

CONTEXT:
- Lead name: [name]
- Source: [source] · [source_detail]
- Lead said / form-submitted: [content if available]
- Pain signals: [pain_signals]
- Notes: [notes]
- Income band: [if known]
- Readiness: [if known]

GOAL:
Draft ONE response. Short. In [Coach Name]'s voice. Goal is to start a real
conversation — not pitch, not sell, not info-dump. End with one of their
typical openers (a question that invites a real reply).

CONSTRAINTS:
- Max 4 sentences.
- No "I hope this finds you well."
- No "I noticed you signed up..."
- No emoji unless [Coach] uses them in their samples.
- Do not promise a call unless the lead asked for one.
```

Output is markdown text only — no JSON envelope, just the draft.

## UI changes

### 1. `/today` — Just-landed band

Above the focus queue, when there are leads with status='new' AND a draft of purpose='first_response' AND direction='draft', render a band:

```
✨ JUST LANDED (3)
Drafts ready in your voice. Review and send — most coaches close 21x more
when they respond in under 5 minutes.

  [Lead 1 name · 2 min ago · "Source: IG quiz"]  [Review draft →]
  [Lead 2 name · 7 min ago · "Source: Newsletter"] [Review draft →]
  [Lead 3 name · 12 min ago · "Source: Referral"]  [Review draft →]
```

Visual treatment: green accent (#00FF41), urgent but not panicky. The band auto-collapses once all drafts are sent or discarded.

### 2. Lead detail (`/leads/[id]`) — Draft-ready panel

When the lead has a `direction='draft'` `purpose='first_response'` row, surface it at the very top of the detail view:

```
┌─────────────────────────────────────────────────────────┐
│ ✨ AI-DRAFTED FIRST RESPONSE                            │
│ Generated 3 minutes ago in your voice.                  │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Hey [name] — saw your message about [pain signal]…  │ │
│ │ [editable textarea with the full draft]             │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [✓ Send via Gmail]  [Copy]  [Edit]  [Discard]           │
└─────────────────────────────────────────────────────────┘
```

Send actions:
- **Send via Gmail** (only if Gmail is connected — phase 2): actually sends, marks message as outbound, sets sent_at, updates lead.last_contact_at and status='contacted'
- **Copy** (always available): copies text to clipboard, marks as `sent_at = now()` after coach confirms it was actually sent — they paste into IG DM, LinkedIn, wherever
- **Edit**: opens the textarea, save updates content, status stays 'draft'
- **Discard**: deletes the draft row, lead remains 'new' for manual handling

### 3. `/settings/integrations` (or new `/settings`) — Auto-draft toggle

```
AUTO-RESPONSE ENGINE
[✓] Draft a first response when a new lead arrives
[✓] Email me when a draft is ready
```

Both toggle `cp_coach_settings.auto_draft_on_new_lead` and `auto_draft_email_notification`.

## Notification email

Sent via Resend (https://resend.com — simplest transactional email service for Cloudflare/Supabase stacks). Free tier covers ~3K emails/month, plenty for founding 10.

Template (HTML + plain text):

> **Subject:** Draft ready: [Lead Name] just landed
>
> [Lead Name] just submitted via [Source]. I drafted a response in your voice.
>
> [First 200 characters of draft]
>
> [Review and send →] (deep link to /leads/[id])
>
> Most coaches close 21x more when they respond within 5 minutes. You're at minute [N].

Coach can disable via settings or per-email unsubscribe link.

## Metrics — `/analytics`

Add a new card at the top of the analytics dashboard:

```
┌─────────────────────────────────────────────────────────┐
│  YOUR FIRST-RESPONSE TIME                               │
│                                                         │
│  3 minutes 47 seconds                                   │
│  median, last 30 days                                   │
│                                                         │
│  Industry average: 24 hours.                            │
│  Leads contacted in <5 min are 21x more likely to close.│
│  You're 487x faster than industry average.              │
└─────────────────────────────────────────────────────────┘
```

Computation: for each lead with status not in ('new', 'closed_lost'), find the first outbound `cp_lead_messages` row for that lead. Compute `sent_at - lead.created_at`. Median across all leads in the window.

## Rollout phases

### Phase 1 — Skeleton (Week 1, ~6 hours)

- Migrations: `cp_leads.auto_draft_eligible`, `cp_lead_messages.purpose`, `cp_coach_settings` table
- Edge Function `auto-draft-response` skeleton + Anthropic call + insert
- No trigger yet — fire manually from `/leads/new` route as a test
- /today renders the just-landed band when drafts exist
- Lead detail surfaces the draft panel with Copy + Discard

**Test gate:** create a lead manually, see a draft appear in /today within 30 seconds.

### Phase 2 — Trigger + Notification (Week 1-2, ~3 hours)

- Postgres trigger calls Edge Function via pg_net
- Resend integration + notification email
- Coach settings page with toggles
- Backfill: any existing 'new' leads without drafts get retroactively drafted

**Test gate:** submit through any path (form, manual, webhook), draft appears within 60 seconds, email arrives.

### Phase 3 — Send + Metrics (Week 2, ~4 hours)

- Send action wires through (manual = Copy + mark sent; Gmail = actual send via Gmail API)
- First-response-time metric in /analytics
- Tighten prompt based on first 20 real drafts

**Test gate:** coach receives email, opens /today, hits Send, lead status moves to 'contacted', metric updates.

### Phase 4 — Source ingestion (Week 2-3, ~5 hours, parallel with Gmail integration)

- Webhook receiver: `POST /api/webhooks/lead` accepts payloads from Tally / Typeform / anywhere, creates cp_leads row → trigger fires automatically
- Native lead capture form template: hosted Coach Platform page coaches can embed or link to
- Gmail integration's `gmail-sync` Edge Function creates leads when an email arrives from a previously-unseen sender — trigger fires automatically

**Test gate:** Tally form submission → lead appears in Coach Platform within 60 seconds → draft + email follow.

## Open questions for Sunny

1. **Channel default for auto-drafts.** First-response goes out via — email? IG DM? LinkedIn? My pick: pull from `lead.source` — IG quiz lead → channel='dm_ig', referral → channel='email', etc. Coach can override before sending. Agree?

2. **What does "Send" do in V1 if Gmail isn't integrated yet?** My pick: Copy-to-clipboard + "Mark as sent" button. Coach pastes into wherever and confirms. Once Gmail is integrated, that path becomes "Send via Gmail" for email leads. Agree?

3. **Failure mode — what if the AI takes 60 seconds or fails entirely?** My pick: trigger has a 30-second timeout. On failure, the lead still exists, just no draft. Coach sees the lead in /today's normal focus queue (no "Just landed" band entry). No retry storm. Agree?

4. **Voice profile missing.** If the coach hasn't completed Brand OS Step 2, there's no voice. My pick: skip auto-draft entirely with a one-line prompt in /today: "Complete your Brand OS voice to enable auto-response →". Agree?

5. **Draft expiration.** If a coach hasn't reviewed a draft in 24 hours, do we auto-discard? My pick: NO — let it sit. The point is the coach gets back to it eventually. We just don't surface it in "Just landed" after 24 hours; it lives quietly on the lead detail page. Agree?

## What this unlocks

Once shipped:

- **Marketing line:** "The only tool that auto-responds to leads in your actual voice within minutes — not template autoresponder garbage."
- **Sales demo:** Sunny submits a fake form on a coach's site live during a sales call. Draft email arrives in their inbox 30 seconds later. They read it. They go "wait, that sounds like me." Sale closes itself.
- **Founding 10 retention:** the coaches who use it for 30 days won't churn. It's the kind of utility that becomes invisible because it just works.
- **First-response-time metric** becomes a screenshot people share. Compounding distribution.

This is the wedge. Build it next.
