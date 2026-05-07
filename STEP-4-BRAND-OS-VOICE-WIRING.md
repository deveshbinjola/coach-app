# Step 4: Wire Brand OS Step 2 to cp_voice_profiles

Brand OS Agent has 4 steps: **Avatar, Voice, Content Pillars, 30 to 45 days content**. Step 2 (Voice) produces a voice artifact. We need that artifact to land in `cp_voice_profiles` so the `draft-message` Edge Function can pull it.

## What needs to happen

```
[Brand OS Agent Step 2 completes]
        │
        ▼
[Voice JSON produced]
        │
        ▼
[INSERT into cp_voice_profiles]   ← what you're wiring now
        │
        ▼
[draft-message function reads it on every AI draft]
```

## The contract: what voice_json should look like

The schema is `jsonb` so you have flexibility, but the drafter prompt expects something like this:

```json
{
  "tone": ["direct", "warm", "challenging", "embodied"],
  "sentence_rhythm": "short. punchy. then a longer line that builds tension. then a short.",
  "vocabulary": {
    "use": ["clarity", "embodiment", "alignment", "the work", "brother"],
    "avoid": ["hustle", "grind", "10x", "synergy", "leverage"]
  },
  "openers": [
    "Hey brother",
    "Real talk:",
    "Quick one:"
  ],
  "closers": [
    "Speak soon.",
    "If this lands, hit reply.",
    "Curious where you're at."
  ],
  "ctas": [
    "want to jump on a 30-min Zoom?",
    "drop your biggest stuck point",
    "send me a voice note"
  ],
  "emotional_register": "warm but not soft. challenges with care. doesn't perform certainty.",
  "do_nots": [
    "no emoji unless they used one first",
    "no 'I hope this finds you well'",
    "no exclamation marks back-to-back"
  ]
}
```

`sample_messages` is a `text[]` of 3–10 actual messages the coach has written (best signal for the model).

## Preferred integration, call Coach App API

Coach App now exposes a write endpoint for this:

```bash
curl -X POST https://app.elevateaisystem.com/api/v1/voice \
  -H "Authorization: Bearer cp_live_xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "voice_json": {
      "tone": ["direct", "warm", "challenging", "embodied"],
      "sentence_rhythm": "short. punchy. then a longer line that builds tension. then a short.",
      "vocabulary": {
        "use": ["clarity", "embodiment", "alignment", "the work", "brother"],
        "avoid": ["hustle", "grind", "10x", "synergy", "leverage"]
      },
      "openers": ["Hey brother", "Quick one:"],
      "closers": ["Speak soon.", "Curious where you are at."],
      "ctas": ["want to jump on a 30-min Zoom?", "send me a voice note"],
      "emotional_register": "warm but not soft. challenges with care. does not perform certainty.",
      "do_nots": ["no emoji unless they used one first", "no template-tone opener"]
    },
    "sample_messages": ["actual message 1", "actual message 2"]
  }'
```

Auth is a Coach App API key with `write` scope. Create it in Settings.

Response:

```json
{
  "voice": {
    "id": "...",
    "version": 2,
    "voice_json": {},
    "sample_messages": [],
    "active": true,
    "created_at": "..."
  },
  "message": "Voice profile imported. Future drafts will use this active voice."
}
```

This endpoint deactivates the previous active profile, inserts a new version,
and every drafting surface starts reading it immediately.

## Alternate patch, direct database insert

If Brand OS is running inside trusted server code and already has Supabase
service-role access, you can insert directly instead.

### The TypeScript snippet

```ts
// Inside whatever handler completes Brand OS Step 2
import { createClient } from "@supabase/supabase-js";

async function saveVoiceProfile(coachId: string, voiceJson: object, sampleMessages: string[]) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!  // service role bypasses RLS for system inserts
  );

  // Deactivate prior profiles
  await supabase
    .from("cp_voice_profiles")
    .update({ active: false })
    .eq("coach_id", coachId)
    .eq("active", true);

  // Get next version number
  const { data: latest } = await supabase
    .from("cp_voice_profiles")
    .select("version")
    .eq("coach_id", coachId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (latest?.version ?? 0) + 1;

  // Insert new active profile
  const { data, error } = await supabase
    .from("cp_voice_profiles")
    .insert({
      coach_id: coachId,
      voice_json: voiceJson,
      sample_messages: sampleMessages,
      version: nextVersion,
      active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

## The "should-I-use-an-Edge-Function" question

Yes. This should run server-side, not in the browser. Two paths:

1. **Call Coach App API**. Best default. Brand OS posts to `/api/v1/voice` with a write API key.

2. **Inside the existing Brand OS endpoint**. Use the direct insert snippet above if Brand OS already has service-role Supabase access.

## Versioning , why we don't overwrite

A coach's voice will evolve. Maybe they re-run Brand OS in 6 months with new samples. We:
- Set `active = false` on the old profile
- Insert a new row with `version = previous + 1` and `active = true`
- The drafter always reads the active row
- Old profiles are kept for audit / rollback

## Backfill for the founding 10

For coaches in the Augmented Coach Cohort who already have a voice from Brand OS:

```sql
-- One-off: insert their voice profiles directly via the Supabase SQL editor
insert into cp_voice_profiles (coach_id, voice_json, sample_messages, version, active)
values
  ('<coach-uuid>', '{"tone":["..."], ...}'::jsonb, ARRAY['msg 1', 'msg 2'], 1, true);
```

## Verification

1. Run Brand OS as a test coach
2. Complete Step 2
3. POST the Step 2 artifact to `/api/v1/voice`
4. Check Supabase Table Editor, `cp_voice_profiles`, your row should appear
5. Open Coach App, any lead, click AI Draft
6. Output should now sound like the coach instead of generic warm-but-direct fallback
