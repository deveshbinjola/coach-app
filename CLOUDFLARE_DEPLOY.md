# Deploy coach-app to Cloudflare Pages

This is the runbook for shipping the Next.js app to `app.elevateaisystem.com`.
Follow it once, top to bottom. Each step takes 60 seconds or less.

The marketing site (`Website/`) stays as a separate Cloudflare Pages project
on `www.elevateaisystem.com`. They are siblings in the repo, both deployed
to the same DNS zone, on different subdomains. Standard SaaS topology.

---

## Step 1. Install the new dependencies locally (one-time)

Open a terminal in `coach-app/` and run:

```bash
npm install
```

This pulls in `@cloudflare/next-on-pages`, `wrangler`, and `vercel` (the
adapter uses Vercel's build pipeline under the hood). Already added to
`package.json`. Should complete in under 90 seconds.

## Step 2. Smoke-test the build locally (recommended, 2 min)

```bash
npm run pages:build
```

This runs `npx @cloudflare/next-on-pages` and emits the production bundle
to `.vercel/output/static`. If it builds clean, your CF deploy will too.

If it errors: usually it's a server-action or page using a Node API not
supported on the edge runtime. Read the error, find the page, add
`export const runtime = "edge";` at the top, rerun. None of our current
pages should hit this since middleware is already edge-compatible and our
route handlers are simple.

## Step 3. Push to your git remote

Make sure these new files are committed:

- `coach-app/wrangler.toml`
- `coach-app/package.json` (updated)
- `coach-app/next.config.mjs` (updated)
- `coach-app/CLOUDFLARE_DEPLOY.md` (this file)
- `coach-app/AGENTS.md`

CF Pages connects to your git repo and pulls from there.

```bash
git add coach-app/wrangler.toml coach-app/package.json coach-app/package-lock.json coach-app/next.config.mjs coach-app/CLOUDFLARE_DEPLOY.md coach-app/AGENTS.md
git commit -m "Wire coach-app for Cloudflare Pages deploy"
git push
```

---

## Step 4. Create the Pages project in Cloudflare (5 min)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com).
2. Left sidebar: **Workers & Pages** -> **Create application** -> **Pages** tab -> **Connect to Git**.
3. Authorize GitHub if you haven't already, then pick your repo. Same repo as the marketing site.
4. Name it: `coach-app` (the auto-deploy URL will be `coach-app.pages.dev`).
5. Production branch: `main` (or whatever your main branch is).

### Build configuration (this matters)

Type these in EXACTLY:

| Field | Value |
|-------|-------|
| **Framework preset** | None (or "Next.js" if it shows up, but configs override) |
| **Build command** | `npx @cloudflare/next-on-pages` |
| **Build output directory** | `.vercel/output/static` |
| **Root directory (advanced)** | `coach-app` |
| **Node version** | `20` (set via env var: `NODE_VERSION=20`) |

### Environment variables (Settings -> Environment variables)

Add these under **Production** (and **Preview** if you want preview deploys to work too):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://modepuhwinzdngirlnkz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (paste your anon key from CLAUDE.md) |
| `NEXT_PUBLIC_BRAND_OS_AGENT_URL` | `https://elevateaisystem.com/brand-os-agent` |
| `NODE_VERSION` | `20` |

**DO NOT** add `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` here. Those
live in your Supabase Edge Function environment, not in the frontend.

### Compatibility flags (Settings -> Functions)

Add `nodejs_compat` to the production compat flags. This is also set in
`wrangler.toml`, but adding it in the dashboard makes it explicit. Required
for the Supabase SDK and a few Next.js polyfills.

Click **Save and Deploy**. First build takes ~3-5 minutes. You'll see green
when it's live at `coach-app.pages.dev`.

---

## Step 5. Connect the custom domain (5 min)

1. In the Pages project (left sidebar): **Custom domains** -> **Set up a custom domain**.
2. Type: `app.elevateaisystem.com`.
3. Click **Activate domain**.

Cloudflare detects you already have the `elevateaisystem.com` zone in CF
DNS, so it auto-creates the CNAME for you. No manual DNS edit needed.

After ~30 seconds, `app.elevateaisystem.com` resolves to the new app.

---

## Step 6. Verify the deploy

Open in a browser:

- `https://app.elevateaisystem.com/login` -> should show the login page
- `https://app.elevateaisystem.com/welcome` -> should redirect to login (because no session)
- Sign in with Google -> should land on `/welcome` if first-time, else `/command-center`

Check the Cloudflare dashboard:

- **Workers & Pages** -> `coach-app` -> **Deployments** should show the latest commit hash with a green checkmark.
- **Real-time logs** (if available) shows incoming requests.

If anything 500s, check **Functions logs** for the stack trace. Usually
either a missing env var or an unsupported Node API.

---

## Step 7. Update marketing-site links

In `Website/`, anywhere there's a "Sign in" or "Open the app" button, point it at the new subdomain:

```html
<!-- Old -->
<a href="/coach-platform">Coach Platform</a>

<!-- New (open the app) -->
<a href="https://app.elevateaisystem.com">Open the app</a>

<!-- Or, sign-in directly -->
<a href="https://app.elevateaisystem.com/login">Sign in</a>
```

Files most likely to need updates:

- `Website/coach-platform.html` (the marketing landing for this product)
- `Website/index.html` (homepage CTAs)
- `Website/navbar.js` (sitewide nav)

Search-and-replace candidate: any `href="/coach-platform"` that previously
went to the marketing landing should stay. But any `href="..."` that says
"sign up" or "log in" or "open the app" should swap to the new subdomain.

---

## Common issues + quick fixes

**Build fails with "Cannot find name 'Deno'" or similar.**
Those errors are in `supabase/functions/*` which is Deno code, not
Next.js. CF only builds the Next.js app. The errors come from `tsc` in
local dev. They are pre-existing baseline (see AGENTS.md), do not affect
the CF build. If CF reports these specifically, your build command is
wrong. It should be `npx @cloudflare/next-on-pages`, not `npx tsc`.

**Build fails with "Module not found: Can't resolve 'next/dist/...'"**
Run `npm install` again in `coach-app/`. Sometimes the lockfile drifts.

**App loads but auth redirect loops between /login and /welcome.**
Check that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
are set in CF env vars. Without them, the supabase client throws on
construction and middleware can't read the session.

**Supabase auth callback redirects to localhost:3000.**
In Supabase Dashboard -> Authentication -> URL Configuration, add
`https://app.elevateaisystem.com/auth/callback` to the allowed redirect URLs.

**Google OAuth fails with "redirect_uri_mismatch".**
In Google Cloud Console -> Credentials -> your OAuth client, add
`https://app.elevateaisystem.com/auth/callback` to authorized redirect URIs.

---

## What did NOT change

The Supabase Edge Functions (`voice-mine`, `voice-demo-draft`, `draft-message`,
`auto-draft-response`, `voice-leads-parse`, etc.) are unchanged. They
deploy to Supabase, not Cloudflare. Already live and working.

The marketing site at `Website/` is unchanged. Still on its existing CF
Pages project, still serving from `www.elevateaisystem.com`.

Database schema, RLS policies, voice profiles, all unchanged.

This is a frontend-deploy change only.

---

## After deploy: optional polish

- Set up **Preview deploys** for non-main branches (CF Pages does this automatically when you push a branch).
- Add a **deploy hook** so Notion or Slack pings you when the app deploys.
- Configure **Web Analytics** in CF (free, GDPR-friendly, 1 line of HTML).
- Move the share-card image generation to a dedicated `/api/share-card` route that Cloudflare Workers can cache.

These are nice-to-haves. None block the core deploy.
