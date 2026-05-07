# Step 3 — Edge Function Secrets

The `draft-message` Edge Function is **DEPLOYED** and ACTIVE. It needs your Anthropic API key to actually call Claude.

## Set the secret

Two ways:

### Option A — Supabase Dashboard (3 clicks)

1. https://supabase.com/dashboard/project/modepuhwinzdngirlnkz/functions/secrets
2. Click **Add new secret**
3. Name: `ANTHROPIC_API_KEY`
4. Value: `sk-ant-api03-...` (your key from https://console.anthropic.com/settings/keys)
5. Save. Function will pick it up on next invocation.

### Option B — Supabase CLI

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-... --project-ref modepuhwinzdngirlnkz
```

## Test the function

```bash
# Get a session token first by signing in via the app, then:
curl -X POST 'https://modepuhwinzdngirlnkz.supabase.co/functions/v1/draft-message' \
  -H 'Authorization: Bearer YOUR_USER_JWT' \
  -H 'Content-Type: application/json' \
  -d '{"lead_id": "SOME_UUID"}'

# Expected response:
# { "draft": "Hey [name] — saw your message about..." }
```

Or just open the app, click any lead, hit **✨ AI Draft** — that's the canonical test.

## What the function does (one line)

`{lead_id} → fetch lead + last 10 messages + active voice profile → call Claude with voice-matched system prompt → save draft + audit row → return the draft text`

## What it costs

- Sonnet 4.6 input: $3/MTok, output: $15/MTok
- Average draft = ~1,000 input + 200 output tokens = **~$0.006 per draft**
- 10 coaches × 30 drafts/mo = 300 drafts/mo = **$1.80/mo total Anthropic spend**
- You're charging $100/mo. Margin is essentially 100%.

## If it returns an error

| Error | Fix |
|-------|-----|
| `ANTHROPIC_API_KEY not configured` | Set the secret per above |
| `Lead not found or RLS blocked` | Lead doesn't belong to that coach; check `coach_id` |
| `Anthropic API 401` | Bad key — regenerate in console |
| `Anthropic API 429` | Rate limited — increase plan or add retry |
| `Not authenticated` | Frontend isn't sending the JWT — check `Authorization: Bearer` header |

## Logs

https://supabase.com/dashboard/project/modepuhwinzdngirlnkz/functions/draft-message/logs
