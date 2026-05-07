# Step 1 — Enable Supabase Auth (Magic Link)

**Time: 3 minutes. Done in the Supabase dashboard, not in code.**

## Why magic link

Coaches are not engineers. Passwords are friction. Magic link = paste email, click link, in. Same UX as Substack and Notion.

## Click-by-click

1. Go to **https://supabase.com/dashboard/project/modepuhwinzdngirlnkz/auth/providers**

2. **Email provider** — should already be ON by default. Confirm:
   - ✅ Enable Email Provider: ON
   - ✅ Confirm email: OFF (we want one-tap magic link, not double opt-in)
   - ✅ Secure email change: ON
   - ✅ Secure password change: ON
   - Save.

3. Go to **https://supabase.com/dashboard/project/modepuhwinzdngirlnkz/auth/url-configuration**

4. Set **Site URL**:
   - For local dev: `http://localhost:3000`
   - For prod (when deployed): `https://app.elevateaisystem.com` (or whatever subdomain you pick)

5. Set **Redirect URLs** (whitelist — add ALL of these):
   ```
   http://localhost:3000/auth/callback
   http://localhost:3000/inbox
   https://app.elevateaisystem.com/auth/callback
   https://app.elevateaisystem.com/inbox
   ```
   Click **Save**.

6. Go to **https://supabase.com/dashboard/project/modepuhwinzdngirlnkz/auth/templates**

7. **Magic Link template** — click "Magic Link" tab. Replace default with:
   ```html
   <h2>Your link to ElevateAI Coach Platform</h2>
   <p>Click below to sign in. Link expires in 1 hour.</p>
   <p><a href="{{ .ConfirmationURL }}">Sign in to your dashboard</a></p>
   <p style="color:#666;font-size:12px">If you didn't request this, ignore this email.</p>
   ```

8. (Optional, recommended later) Go to **Auth → SMTP Settings** and connect your own SMTP (Resend, Postmark, SendGrid). Default Supabase SMTP is rate-limited at 4 emails/hour. Fine for the founding 10. Required when you scale past 10 coaches.

## How a coach signs in (the user flow)

1. Coach lands on `app.elevateaisystem.com/login`
2. Enters email, clicks **Send Magic Link**
3. Receives email with link → clicks
4. Lands on `/inbox` already authenticated
5. Session cookie persists for 1 week (configurable)

## Auto-create coach record on first sign-in

When a coach signs in for the first time, `auth.users` gets a row but `cp_coaches` does NOT. We need a trigger to mirror new auth users into `cp_coaches`.

**This is a SQL migration — already covered in the next file (`STEP-1B-AUTO-PROVISION-COACH.sql`).** Apply it from the Supabase SQL Editor or via the Supabase MCP.

## Verification

After setup:
1. Visit `http://localhost:3000/login` (after Step 2 frontend is running)
2. Enter `sunny.binjola@gmail.com`
3. Check inbox — should arrive within 30 sec
4. Click link → land on `/inbox`
5. In Supabase dashboard → **Authentication → Users** — your row should be there
6. In **Table Editor → cp_coaches** — your row should be there too (via trigger)

If step 6 fails, the trigger didn't fire. Re-run the migration.
