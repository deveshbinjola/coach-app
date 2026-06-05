# Flow Smoke Test System — Design

**Goal:** Catch the runtime/integration bugs that unit tests and `tsc` cannot — wrong foreign keys, broken API contracts, dead flows — by running a small suite of **authenticated, end-to-end flow checks** as a real test coach, against both a local prod server and the live Cloudflare deployment.

**Architecture:** One parameterized runner, `scripts/flow-smoke.mjs`, signs in as a dedicated test-coach account (Supabase password grant), presents that session as the app's auth cookie, exercises real flows against a `BASE_URL`, and verifies results **both** via the API response and by reading the row back through the service-role admin client. It seeds the data it needs, cleans up after itself, and writes reports/tickets in the existing `qa/` format. v1 proves the rails on one flow: **Sessions (save → list)**.

**Tech Stack:** Node ESM script (matches the existing `scripts/qa-daily.mjs` harness), `@supabase/supabase-js` (anon sign-in + service-role admin), `fetch`. No new heavy deps (no Playwright in v1).

**Why this exists:** The existing `qa:daily` harness tests *anonymous* behavior (pages/APIs respond safely when logged out). It never logs in and does anything, so it missed: the `cp_coaching_sessions` FK pointing at the wrong table, Dhara's empty streaming reply on Cloudflare, and the session-save AI hang. Those only surface when a real coach performs a real action.

---

## 1. Scope

**In (v1):**
- `scripts/flow-smoke.mjs` — the parameterized authed flow runner: auth → seed → run flow → assert (API + DB read-back) → cleanup → report/ticket → non-zero exit on failure.
- One flow: **Sessions save → list** (the exact class of bug that just shipped).
- `npm run test:flows` script. Runs against `BASE_URL` (default `http://localhost:3210`; pass the live URL for the post-deploy smoke).
- Reuse the existing `qa/reports/` + `qa/tickets/` output convention.
- A documented one-time setup: create the test-coach account + add its creds to env.

**Out (fast-follows, cheap once the rails exist):**
- Additional flows: Dhara (data answer + AI reply), quiz (generate → save → public render), leads/clients + dashboards.
- GitHub Actions CI (none exists today; v1 runs locally + via the existing scheduled QA cadence).
- Playwright browser E2E (kept as a fallback for the cookie step; not a v1 dependency).

---

## 2. Environments (one runner, two targets)

The runner takes `BASE_URL`:
- **Local (pre-push):** `BASE_URL=http://localhost:3210` against `next build` + `next start` (same server the existing harness spins up). Fast feedback before pushing. Runs on Node, so it will NOT catch Cloudflare-workerd-only bugs.
- **Live (post-deploy):** `BASE_URL=https://app.elevateaisystem.com` against the deployed Cloudflare app. The ONLY way to catch Cloudflare-runtime-specific bugs (e.g. the empty-streaming one). Wired into the existing scheduled QA cadence.

Both targets use the **same prod Supabase** (the live app's DB), so the test data lives there regardless. This is why a separate staging DB is not used in v1 — it could not back the live smoke.

---

## 3. Test coach + data lifecycle

- **Account:** a dedicated auth user (e.g. `qa+coach@elevateaisystem.com`). Created once via the Supabase admin API during setup. Creds in env: `QA_COACH_EMAIL`, `QA_COACH_PASSWORD`.
- **Isolation:** every test row is scoped to this coach's `id`. The runner never touches another coach's data.
- **Seed:** before the Sessions flow, ensure a known lead exists for the test coach (`full_name = "QA Smoke Lead"`); reuse it across runs (upsert by a stable marker, e.g. a tag or email), capture its `id`.
- **Cleanup:** after the flow, delete the rows the run created (the session; keep the persistent seed lead). All deletes are `.eq("coach_id", testCoachId)` guarded. Cleanup runs even on assertion failure (finally block).
- **Clients used:** the **service-role admin client** (from `SUPABASE_SERVICE_ROLE_KEY`) for seed/read-back/cleanup; the **test coach's authed session** for the actual app requests (so the real auth path is exercised).

> Safety: tests create + delete rows in the prod Supabase as this one test coach. All writes/deletes are coach-scoped; the seed lead persists, transient rows are removed each run.

---

## 4. Authenticating as the app expects (the one fiddly part)

The app uses `@supabase/ssr` cookie auth. The runner must present the test coach's session as the cookie the server reads.

- Sign in: `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` with the anon key + `{ email, password }` → returns a session (`access_token`, `refresh_token`, `expires_at`, `user`, …).
- Build the cookie `sb-<project-ref>-auth-token` in the `@supabase/ssr` format: value = `base64-` + base64(`JSON.stringify(session)`). If the encoded value exceeds the SSR chunk threshold (~3180 bytes), split across `sb-<ref>-auth-token.0`, `.1`, … (the SSR lib reassembles chunked cookies). Project ref: `modepuhwinzdngirlnkz`.
- Send that as the `Cookie` header on every app request.
- **Verification step in the plan:** hit a known authed JSON endpoint (e.g. `GET /api/dhara/memory` or `GET /api/sessions`) and confirm it returns `200` (not `401`) before running flows. If the cookie format proves brittle, the documented fallback is a one-time Playwright login to capture a real cookie (out of v1's default path).

---

## 5. The Sessions flow (first check)

`runSessionsFlow(ctx)` where `ctx = { baseUrl, cookie, admin, testCoachId, seedLeadId }`:
1. `POST {baseUrl}/api/sessions` with `{ client_id: seedLeadId, raw_notes: "qa smoke note", session_date: <today ISO> }` + auth cookie. Expect `201` and a `session.id`.
2. **DB read-back (the FK catch):** `admin.from("cp_coaching_sessions").select("id, coach_id, client_id").eq("id", session.id).single()` → row exists, `coach_id === testCoachId`, `client_id === seedLeadId`. (A wrong FK makes step 1 `500`; this asserts the write truly landed.)
3. `GET {baseUrl}/api/sessions?client_id={seedLeadId}` + cookie → the created session id is present in the list.
4. Cleanup: `admin.from("cp_coaching_sessions").delete().eq("id", session.id).eq("coach_id", testCoachId)`.
Each step records pass/fail with a clear message.

---

## 6. Reporting (reuse existing convention)

- On completion, append a report to `qa/reports/<timestamp>.md` summarizing each flow + step (pass/fail).
- On any failure, write a ticket draft to `qa/tickets/<timestamp>-flow-<name>-<hash>.md` (matching the existing naming).
- Exit code: `0` all pass, `1` any failure (so a pre-push hook or scheduled task can gate/alert). Local-only output; never posts to third parties (matches `qa/README.md` policy).

---

## 7. File structure
```
Create:
  scripts/flow-smoke.mjs                 # the runner: auth, seed, flows, assert, cleanup, report
  scripts/flow-smoke/auth.mjs            # supabase sign-in + SSR cookie construction
  scripts/flow-smoke/sessions.mjs        # the Sessions save->list flow check
  scripts/flow-smoke/report.mjs          # report/ticket writers (qa/ format) + exit handling
  docs/qa/flow-smoke.md                  # how to run, env vars, how to add a flow
Modify:
  package.json                           # add "test:flows": "node scripts/flow-smoke.mjs"
  .env.local.example                     # document QA_COACH_EMAIL / QA_COACH_PASSWORD
```

---

## 8. Env vars
- `QA_COACH_EMAIL`, `QA_COACH_PASSWORD` — the test coach (new).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — sign-in (exist).
- `SUPABASE_SERVICE_ROLE_KEY` — seed/read-back/cleanup (exists locally + in Cloudflare).
- `BASE_URL` — target (default local `:3210`).

---

## 9. Testing the test system
- Run `test:flows` locally against a running server → expect all green, a fresh `qa/reports/` entry, no leftover rows.
- Force a failure (temporarily point the seed lead id at a bogus uuid) → expect a non-zero exit + a `qa/tickets/` draft. Revert.
- Sanity: re-run twice → no accumulation of session rows (cleanup works).

---

## 10. Open questions (resolve in planning)
- Confirm the exact `@supabase/ssr` cookie serialization in the installed version (base64 prefix + chunking threshold) against a real logged-in cookie.
- Whether to start the local server inside the runner (like `qa-daily.mjs`) or assume an already-running server (`pages:preview` / `next start`). Lean: assume a running server for v1 simplicity; document the command.
- Where the test-coach creds live for the live post-deploy run (Cloudflare/scheduler secret) — note for the cadence wiring, not blocking v1 local.
