# Granola → Session Intelligence Integration Research

**Date:** 2026-05-28  
**Status:** Research complete, ready for implementation decision

---

## Executive Summary

Granola exposes meeting data via both a REST API and an official MCP server. The coach-app can import coaching session transcripts, summaries, and metadata from Granola into `cp_coaching_sessions` with minimal friction. **Recommended approach: an "Import from Granola" button on the New Session form** that lists recent meetings and auto-fills fields.

---

## 1. Granola API Capabilities

### REST API (Public)

| Detail | Value |
|--------|-------|
| Base URL | `https://public-api.granola.ai/v1/` |
| Auth | Bearer token (`grn_*` format) |
| Plan requirement | Business plan (workspace members) |
| Rate limits | 25 req burst, 5 req/s sustained |

**Endpoints:**
- `GET /notes` — paginated list of meeting notes (filter by date)
- `GET /notes/:id` — full note by UUID (transcript, summary, attendees, metadata)

**Limitations:**
- No search endpoint (must list + filter client-side)
- Only returns notes with completed AI summaries
- Notes still processing return 404

### MCP Server (Official)

| Detail | Value |
|--------|-------|
| Endpoint | `https://mcp.granola.ai/mcp` |
| Auth | OAuth 2.1 with PKCE + dynamic client registration |
| Plan gating | Free = 30 days, no transcripts. Business+ = full history + transcripts |

**Tools exposed:**
- **query** — natural-language questions across meeting history
- **list_meetings** — by time range (this_week, last_week, last_30_days, custom ISO)
- **get_meeting_details** — AI summaries, private notes, attendees (up to 10 by UUID)
- **get_transcripts** — full verbatim transcripts by meeting UUID
- **search** — search transcripts, calendar events, structured note panels

### Webhooks

**Not available.** No push mechanism exists. Polling REST or on-demand fetch is the only pattern.

---

## 2. Data Fields Available from Granola

| Granola Field | Type | Notes |
|---------------|------|-------|
| id (UUID) | string | Unique meeting identifier |
| title | string | Meeting title from calendar |
| meeting_date | ISO datetime | When the meeting occurred |
| created_at / updated_at | ISO datetime | Record timestamps |
| owner | { name, email } | Who recorded the meeting |
| attendees | array | Participant names/emails |
| ai_summary | string | Granola's AI-generated summary |
| transcript | string | Full verbatim transcript (speaker-differentiated) |
| private_notes | string | User's private notes during meeting |
| folders | array | Organizational folders |
| workspace_id | string | Workspace context |

**Action items** are extractable via the MCP `query` tool but are not a discrete field in the REST response.

---

## 3. Data Mapping: Granola → cp_coaching_sessions

| cp_coaching_sessions column | Source from Granola | Transform |
|-----------------------------|--------------------|-----------| 
| `client_id` | attendees[] | Coach selects which attendee = client |
| `session_date` | meeting_date | Direct ISO mapping |
| `duration_minutes` | (not directly available) | Calculate from transcript timestamps or leave null |
| `raw_notes` | private_notes | Direct mapping |
| `transcript` | transcript | Direct mapping (verbatim) |
| `ai_summary` | ai_summary | Use as seed, then re-run `analyzeSession()` for coaching-specific analysis |
| `key_topics` | — | Extract via `analyzeSession()` from transcript + notes |
| `commitments` | — | Extract via `analyzeSession()` (or MCP `query` tool) |
| `somatic_observations` | — | Extract via `analyzeSession()` (Granola won't have these) |
| `patterns_flagged` | — | Extract via `analyzeSession()` with cross-session context |

**Key insight:** Granola provides raw material (transcript + notes). The coach-app's `analyzeSession()` function should still run on the imported data to extract coaching-specific fields (somatic observations, patterns, commitments) since Granola's AI summary is generic, not coaching-aware.

---

## 4. Authentication Options

### Option A: REST API with stored token (Recommended for MVP)

- Coach generates a Granola API key from their workspace settings
- Store encrypted in `coach_settings` or `user_preferences` table
- Simple bearer token auth on each request
- **Pro:** Simple, no OAuth redirect flow needed in-app
- **Con:** Requires Business plan, manual key generation

### Option B: OAuth via MCP server

- Full OAuth 2.1 PKCE flow
- Richer data access (query, search, transcripts on all plans with Business)
- **Pro:** Better UX (one-click auth), more features
- **Con:** More complex to implement, requires OAuth callback handling

### Recommendation

**Start with Option A (API key)** for MVP. Add OAuth later if demand exists for the richer MCP query features.

---

## 5. UX Recommendation

### Primary Flow: "Import from Granola" button on New Session Form

```
[New Session Form]
  ├── Select Client: [dropdown]
  ├── Session Date: [date picker]
  ├── [Import from Granola]  ← NEW BUTTON
  │     └── Opens modal/drawer:
  │           - Lists recent Granola meetings (last 7 days)
  │           - Coach clicks one
  │           - Auto-fills: raw_notes, transcript, session_date
  │           - Coach confirms client mapping
  │           - "Import & Analyze" button
  ├── Raw Notes: [textarea - now pre-filled]
  ├── Transcript: [textarea - now pre-filled]  
  └── [Save & Analyze]
```

### Why not auto-sync?

1. **No webhooks** — would require polling, which is wasteful
2. **Client matching** — Granola attendees don't map 1:1 to coach-app clients without manual confirmation
3. **Not every meeting is a coaching session** — coach needs to select which meetings to import
4. **Privacy** — coaches should explicitly choose what enters the system

### Alternative: Bulk Import (Phase 2)

For coaches transitioning to the platform, a "Sync Last 30 Days" feature could batch-import all meetings and let the coach tag which ones were sessions + assign clients.

---

## 6. Implementation Plan

### Phase 1: MVP (estimated: 2-3 days)

1. **Settings page:** Add Granola API key input field (stored encrypted)
2. **API route:** `POST /api/sessions/import-granola` — fetches meetings list, returns simplified list
3. **API route:** `GET /api/sessions/import-granola/:id` — fetches full meeting data
4. **UI component:** `GranolaImportModal` — lists meetings, handles selection
5. **Form integration:** Wire import button into `NewSessionForm`, auto-fill fields
6. **Analysis:** Run `analyzeSession()` on imported data to extract coaching-specific insights

### Phase 2: Enhanced (future)

- OAuth flow for richer access
- Bulk historical import
- MCP `query` tool integration for cross-meeting pattern detection
- Auto-suggest client matching based on attendee email → client email

### Files to create/modify:

```
components/sessions/GranolaImportModal.tsx   (new)
app/api/sessions/import-granola/route.ts     (new)
app/api/sessions/import-granola/[id]/route.ts (new)
components/sessions/NewSessionForm.tsx       (modify — add import button)
lib/granola.ts                               (new — API client)
```

---

## 7. Open Questions

| Question | Impact | How to resolve |
|----------|--------|----------------|
| Does Sunny's Granola plan include API access? | Blocks implementation | Check Granola workspace settings |
| Should we store `granola_meeting_id` on `cp_coaching_sessions`? | Prevents duplicate imports | Likely yes — add column |
| Do we want MCP-based query for cross-session patterns? | Enriches `patterns_flagged` | Phase 2 — evaluate after MVP |
| Should the coach-app re-summarize or use Granola's summary? | Affects AI costs | Recommend: always re-analyze with coaching lens |

---

## 8. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Granola API changes/breaks | Low | Pin to v1, handle errors gracefully |
| Rate limiting (5 req/s) | Low | Only fetching on user action, not background polling |
| Plan gating blocks transcript access | Medium | Clearly communicate Business plan requirement in UI |
| OAuth complexity if we go that route | Medium | Defer to Phase 2, start with API key |
| Duplicate imports | Medium | Store `granola_meeting_id`, check before insert |
