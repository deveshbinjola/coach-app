# Coach Platform MCP Server

Plug your AI agent — Claude Desktop, Cursor, custom GPT-via-bridge, anything that speaks MCP — directly into your [Coach Platform](https://www.elevateaisystem.com/coach-platform) pipeline. Read your focus queue, log messages, draft in your voice, all from inside your agent.

## Why this exists

Most AI tools ask coaches to trust generic AI. Coach Platform doesn't — it builds in your voice, with you in control. This MCP server makes that whole loop accessible to your *own* agent. Ask Claude "who should I message today?" and it pulls your real focus queue, ranked by urgency × score. Ask it to draft a follow-up and it pulls your Brand OS voice profile first.

## Installation

### 1. Generate an API key

In your coach-app dashboard:

1. Go to **Settings** → **API keys**
2. Click **+ Generate key**, name it something like `Claude Desktop`
3. Copy the `cp_live_...` value shown — **save it now, you won't see it again**

### 2. Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on your platform:

```json
{
  "mcpServers": {
    "coach-platform": {
      "command": "npx",
      "args": ["-y", "@elevate-ai/coach-platform-mcp"],
      "env": {
        "COACH_PLATFORM_API_KEY": "cp_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Restart Claude Desktop. The MCP server will auto-install on first run.

### 3. Add to Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "coach-platform": {
      "command": "npx",
      "args": ["-y", "@elevate-ai/coach-platform-mcp"],
      "env": {
        "COACH_PLATFORM_API_KEY": "cp_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### 4. Other MCP-compatible clients

Anything that supports MCP via stdio works. The command is `npx -y @elevate-ai/coach-platform-mcp`. Pass `COACH_PLATFORM_API_KEY` as an env var.

## Tools exposed

| Tool | Purpose |
|---|---|
| `get_focus_queue` | Top N urgent leads ranked by SLA × score (the /today queue). |
| `list_leads` | Paginated list of all leads with optional status/temperature filters. |
| `get_lead` | Single lead with up to 100 most recent messages. |
| `get_voice_profile` | Coach's active Brand OS voice profile — call this BEFORE drafting any message. |
| `create_lead` | Add a new lead. Auto-Response Engine drafts a first-touch message automatically. |
| `log_message` | Append inbound/outbound/draft to a lead's conversation. |

## Example agent prompts

```
You: Who should I message today?
Agent: [calls get_focus_queue] → "You have 3 overdue leads. Sarah Hennessy
        has been silent for 9 days, last touched after a discovery call.
        Want me to draft a re-engagement?"

You: Yes, draft it.
Agent: [calls get_voice_profile, then get_lead] → "Here's a draft in your
        voice. Should I log it?"

You: Send it.
Agent: [calls log_message with direction='outbound'] → "Logged. Lead bumped
        from 'new' to 'contacted'. Reach number went up by 1."
```

## Development

```bash
git clone <repo>
cd coach-platform-mcp
npm install
npm run build
COACH_PLATFORM_API_KEY=cp_live_... node dist/index.js
```

To target your local coach-app dev server during development:

```bash
COACH_PLATFORM_API_KEY=cp_live_... \
COACH_PLATFORM_BASE_URL=http://localhost:3000 \
node dist/index.js
```

## Configuration

| Env var | Required | Default | Notes |
|---|---|---|---|
| `COACH_PLATFORM_API_KEY` | Yes | — | Generate at `/settings` in your coach-app dashboard. |
| `COACH_PLATFORM_BASE_URL` | No | `https://app.elevateaisystem.com` | Override for dev (`http://localhost:3000`) or staging. |

## Troubleshooting

**"FATAL: COACH_PLATFORM_API_KEY env var is required"** — set it in your MCP client's config. See above.

**HTTP 401 on every tool call** — your API key is invalid or revoked. Generate a new one at `/settings` → API keys.

**HTTP 404 on `get_lead`** — the lead UUID doesn't belong to your coach account, or it doesn't exist. Use `list_leads` to find the right ID.

**Tools don't appear in Claude Desktop** — check that JSON syntax is valid in `claude_desktop_config.json`. Restart Claude Desktop after edits. Check Claude's MCP logs (visible in the Claude Desktop developer panel).

## License

MIT — Sunny Binjola / ElevateAI System
