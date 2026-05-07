# Step 7 — Import leads from CSV, Excel, or Google Sheets

## What you just got

A four-step import wizard at `/leads/import`:

1. **Upload** — drop a `.csv`, `.xlsx`, or `.xls` file, OR paste a Google Sheets share URL
2. **Map columns** — wizard auto-guesses mapping (e.g. `Name` → `full_name`), you can override
3. **Review** — see totals, skip count, defaults
4. **Done** — bulk inserted to `cp_leads`, all scoped to you via RLS

Every parse happens in the browser (PapaParse for CSV, SheetJS for Excel). No data leaves the user's machine except the final batch insert to Supabase.

## Files added / changed

| File | What |
|---|---|
| `components/ImportWizard.tsx` | The 4-step wizard component (new) |
| `app/leads/import/page.tsx` | Route that renders the wizard (new) |
| `components/Header.tsx` | Added "Import" nav link |
| `app/inbox/page.tsx` | Added "Import" button next to "+ Add Lead" |
| `package.json` | Added `papaparse`, `xlsx`, `@types/papaparse` |

## How to use it (coach-facing)

### Option A — CSV or Excel file

1. Inbox → **Import** (top right, or in the nav bar)
2. Drag a `.csv` or `.xlsx` file onto the drop zone (or click **Choose File**)
3. The wizard reads the first row as headers and the first sheet only (Excel)
4. Verify the column mapping in step 2 — `Full Name` is the only required field
5. **Review** the count → **Import N leads**

### Option B — Google Sheet (public)

1. In Google Sheets: **Share → General access → Anyone with the link → Viewer**
2. Copy the URL from the address bar (any format works: `/edit`, `/view`, with or without `#gid=...`)
3. Inbox → **Import** → paste URL into the "Import from Google Sheets" box → **Load Sheet**
4. Map columns → review → import

The wizard transforms `https://docs.google.com/spreadsheets/d/{ID}/edit#gid=0` into `https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid=0` and fetches it directly from the browser.

## Field mapping

| Target field (cp_leads) | What the wizard looks for |
|---|---|
| `full_name` ⭐ required | `name`, `full name`, `fullname`, `contactname`, `first name` |
| `email` | Any column containing "email" |
| `phone` | `phone`, `mobile`, `cell` |
| `source` | `source` — coerced to one of: `ig`, `linkedin`, `referral`, `quiz`, `in_person`, `podcast`, `newsletter`, `other` (falls back to `other`) |
| `status` | `status` — coerced to one of: `new`, `contacted`, `qualified`, `booked`, `client`, `closed_lost` (falls back to `new`) |
| `temperature` | `temperature`, `temp` — coerced to `hot`, `warm`, `cold` (falls back to `warm`) |
| `notes` | `notes`, `note`, any column containing "comment" |
| `tags` | `tags`, `tag`, `labels` — comma-separated |

Anything the wizard can't auto-match stays unmapped — the coach can point it at the right column manually.

## Validation rules

- Rows with a blank `full_name` are skipped (counted on the review screen)
- Duplicate emails **within the same import file** are skipped (first one wins)
- No cross-check against existing leads — that would need a `UNIQUE(email, coach_id)` constraint or a merge UI (see "Future work")
- Unknown enum values (e.g. `source: "instagram"`) coerce to the default rather than rejecting the row

## Limits

- Soft limit: ~10,000 rows per import (browser memory + insert latency)
- Supabase inserts in batches of 500 — if one batch fails partway, earlier batches are committed and the user sees "Inserted X rows, then hit: ..."
- Excel files: only the first sheet is imported. Multi-sheet support = future work.

## Troubleshooting

**"Sheet is private. Share it as 'Anyone with the link can view' and try again."**
→ The Google Sheet isn't public. Change sharing to "Anyone with the link → Viewer" in Sheets.

**"That doesn't look like a Google Sheets URL."**
→ The URL must contain `/spreadsheets/d/{id}`. Copy the full URL from the address bar.

**"No rows found in the file."**
→ The first row must be headers. Empty sheets, multi-header CSVs, and merged Excel headers don't work.

**Imports succeed but tags are empty**
→ Tags must be comma-separated text in one column, e.g. `"warm-lead, cohort-grad, hot"`. Multi-column tags = not supported yet.

---

## Google Sheets: two paths

### Path A — Public URL (shipped today)

- **Pros:** zero setup, instant, no OAuth
- **Cons:** the sheet must be public-readable; one-way (no sync back); manual re-import for updates
- **Best for:** one-time migration from a coach's existing tracker

### Path B — OAuth 2.0 + Sheets API (future work)

Designed but not shipped. The plan:

1. Coach clicks "Connect Google Sheets" in `/settings/integrations`
2. OAuth flow → Google returns access + refresh tokens
3. Store tokens in a new `cp_integrations` table with RLS
4. Coach picks a sheet + tab → save as a "sync source" on their account
5. Edge Function `sync-gsheet-leads` runs nightly: reads the sheet, upserts by email, logs changes to `cp_lead_activities`
6. Optional: push-back updates (when lead moves to `qualified` in ElevateAI, flip the status in the sheet)

Blockers to ship:
- Google Cloud project + OAuth consent screen (unverified → 100-user cap is fine for founding 10)
- Token refresh handling (30-day inactivity = re-auth)
- Conflict resolution UX when the same lead was edited in both systems

If a founding 10 coach asks for two-way sync, ship Path B then. Until then, Path A + a "re-import" button covers 90% of real workflows.

### Path C — Anyone-can-edit sheet as the actual inbox (not recommended)

You *could* make the Google Sheet the source of truth and have ElevateAI just read it. That kills the product — the whole value is the platform's CRM + AI drafts + message log. The sheet is an import source, not a backend.

---

## Manual test checklist (run once before shipping)

```
[ ] Drop a 10-row CSV — all rows import, redirect to inbox, leads visible
[ ] Drop a 10-row .xlsx — all rows import
[ ] Drop a CSV with 3 rows missing Full Name — 7 imported, 3 skipped, banner visible on review
[ ] Drop a CSV with 2 duplicate emails — 1 of each imported, duplicate count on review
[ ] Paste a public Google Sheets URL — rows load
[ ] Paste a PRIVATE Google Sheets URL — wizard shows the "sheet is private" error
[ ] Paste a garbage URL — wizard shows the "doesn't look like a Google Sheets URL" error
[ ] Import a CSV with a Source column containing "Instagram" — coerces to "other" (not "ig") — OK for v1, tighten later
[ ] Map Full Name to an empty column — wizard blocks Next
[ ] Sign out, visit /leads/import — middleware redirects to /login
```

## Post-ship backlog (if import sees traction)

1. **Match existing leads by email on import** — offer merge vs. skip vs. duplicate
2. **Remember mappings** — if the coach imports the same columns again, pre-fill the mapping
3. **Multi-sheet Excel** — let coach pick which tab
4. **Richer enum mapping** — "Instagram" → `ig`, "LinkedIn" → `linkedin`, etc.
5. **Undo last import** — store an `import_batch_id` on each row so you can delete-all in one click
6. **CSV export** — pair with import for round-tripping (e.g. to pull into Notion or Airtable)
7. **Google Sheets OAuth** — path B above
8. **Apollo enrichment on import** — auto-run `apollo:enrich-lead` on rows missing phone/email

## Why this matters

The #1 reason coaches don't switch off spreadsheets is migration friction. A 60-second import that reads their existing Google Sheet removes the last excuse. Ship it, then tell every founding 10 coach: "just paste your tracker URL — I'll do the rest."
