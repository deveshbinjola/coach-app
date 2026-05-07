// Edge Function: gmail-sync
//
// Pulls recent sent + received Gmail messages and logs the ones that match
// a known cp_leads.email into cp_lead_messages. Outbound counts toward
// reach. Inbound resets the SLA clock and shows up in the lead conversation.
//
// Auth model — same dual-auth pattern as auto-draft-response:
//   1. Service role bearer (Phase 9 trigger / scheduled task)
//   2. User JWT bearer (manual "Sync now" button on /settings)
//
// Flow:
//   1. Load active cp_coach_integrations row for the coach.
//   2. If access_token is missing or expired, refresh via the refresh_token.
//   3. Query Gmail messages.list since last_synced_at (or last 14d on first run).
//   4. For each message, fetch headers, classify in/out, match against leads.
//   5. Upsert into cp_lead_messages (deduped by external_id).
//   6. Update last_synced_at on the integration row.
//
// Required secrets (already configured for the coach-app's coach-platform-mcp
// path; same Google OAuth client as the OAuth init/callback routes):
//   GOOGLE_GMAIL_CLIENT_ID
//   GOOGLE_GMAIL_CLIENT_SECRET
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// Sync window. First-run pulls 14 days of history; subsequent runs pull from
// last_synced_at minus a small overlap to forgive clock skew. Capped at 50
// messages per run to keep the function fast and below Edge timeout limits.
const FIRST_RUN_DAYS = 14;
const OVERLAP_MINUTES = 5;
const MAX_MESSAGES_PER_RUN = 50;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ---------- Auth ----------
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    let coachId: string | null = null;
    if (token === serviceRoleKey) {
      // Service-role call — coach_id must be in the body.
      const body = await req.json().catch(() => ({}));
      coachId = body?.coach_id ?? null;
      if (!coachId) {
        return json({ error: "coach_id required for service-role calls" }, 400);
      }
    } else if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) return json({ error: "Invalid auth token" }, 401);
      coachId = user.id;
    } else {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // ---------- Load integration ----------
    const { data: integration, error: integErr } = await supabase
      .from("cp_coach_integrations")
      .select("*")
      .eq("coach_id", coachId)
      .eq("provider", "gmail")
      .maybeSingle();

    if (integErr) {
      return json({ error: "Failed to load integration", details: integErr.message }, 500);
    }
    if (!integration) {
      return json({ skipped: "not_connected", coach_id: coachId });
    }
    if (integration.status !== "active") {
      return json({ skipped: `status_${integration.status}`, coach_id: coachId });
    }

    // ---------- Get a fresh access token if needed ----------
    let accessToken = integration.access_token as string | null;
    const expiresAt = integration.access_token_expires_at
      ? new Date(integration.access_token_expires_at).getTime()
      : 0;
    const needsRefresh = !accessToken || expiresAt - Date.now() < 60_000;

    if (needsRefresh) {
      const refreshed = await refreshAccessToken(integration.refresh_token);
      if (!refreshed) {
        // Refresh token may have been revoked. Mark integration revoked
        // so the coach sees a clear "reconnect" UI, instead of silent fails.
        await supabase
          .from("cp_coach_integrations")
          .update({ status: "revoked" })
          .eq("id", integration.id);
        return json({ error: "Refresh token invalid; integration marked revoked" }, 401);
      }
      accessToken = refreshed.access_token;
      await supabase
        .from("cp_coach_integrations")
        .update({
          access_token: refreshed.access_token,
          access_token_expires_at: new Date(
            Date.now() + refreshed.expires_in * 1000
          ).toISOString(),
        })
        .eq("id", integration.id);
    }

    // ---------- Determine sync window ----------
    let afterEpoch: number;
    if (integration.last_synced_at) {
      afterEpoch = Math.max(
        0,
        new Date(integration.last_synced_at).getTime() -
          OVERLAP_MINUTES * 60_000
      );
    } else {
      afterEpoch = Date.now() - FIRST_RUN_DAYS * 24 * 60 * 60 * 1000;
    }
    // Gmail's `after:` query operator takes seconds, not millis.
    const afterSeconds = Math.floor(afterEpoch / 1000);

    // ---------- List recent messages ----------
    // We pull both inbound and outbound. `in:anywhere` includes Sent + Inbox
    // + Archive but excludes Trash/Spam, which is what we want.
    const listUrl = new URL(`${GMAIL_BASE}/messages`);
    listUrl.searchParams.set("q", `after:${afterSeconds} in:anywhere -in:trash -in:spam`);
    listUrl.searchParams.set("maxResults", String(MAX_MESSAGES_PER_RUN));

    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      const text = await listRes.text();
      return json({ error: `Gmail list failed (${listRes.status})`, details: text }, 502);
    }
    const listData = (await listRes.json()) as {
      messages?: Array<{ id: string; threadId: string }>;
    };
    const messageIds = (listData.messages ?? []).map((m) => m.id);

    if (messageIds.length === 0) {
      await supabase
        .from("cp_coach_integrations")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", integration.id);
      return json({ ok: true, messages_found: 0, messages_synced: 0 });
    }

    // ---------- Fetch headers + match against leads ----------
    // Pre-load the coach's leads-with-email into a map for fast lookup.
    const { data: leadsWithEmail } = await supabase
      .from("cp_leads")
      .select("id, email")
      .eq("coach_id", coachId)
      .not("email", "is", null);

    const emailToLeadId = new Map<string, string>();
    for (const l of leadsWithEmail ?? []) {
      if (l.email) emailToLeadId.set(l.email.toLowerCase().trim(), l.id);
    }

    const coachAccountEmail = (integration.account_email ?? "").toLowerCase().trim();
    let matched = 0;
    let synced = 0;

    // Fetch each message's headers in parallel-ish batches. Keep
    // concurrency low to stay well under Gmail's per-user rate limits.
    const BATCH = 5;
    for (let i = 0; i < messageIds.length; i += BATCH) {
      const slice = messageIds.slice(i, i + BATCH);
      const fetched = await Promise.all(
        slice.map((id) => fetchMessage(id, accessToken!))
      );
      for (const msg of fetched) {
        if (!msg) continue;
        const fromEmail = extractEmail(msg.headers["from"]);
        const toEmails = (msg.headers["to"] ?? "")
          .split(",")
          .map((s) => extractEmail(s))
          .filter(Boolean) as string[];

        // Classify direction by comparing sender to the coach's Gmail.
        const isOutbound = fromEmail === coachAccountEmail;
        const counterparty = isOutbound ? toEmails[0] : fromEmail;
        if (!counterparty) continue;

        const leadId = emailToLeadId.get(counterparty);
        if (!leadId) continue;
        matched++;

        // Insert with ON CONFLICT DO NOTHING via the unique index on
        // (coach_id, external_id). A successful insert returns 1 row;
        // a conflict returns 0. We can't see which from the JS client
        // result, so we just count attempts.
        const { error: insertErr } = await supabase
          .from("cp_lead_messages")
          .upsert(
            {
              lead_id: leadId,
              coach_id: coachId,
              channel: "email",
              direction: isOutbound ? "outbound" : "inbound",
              content: msg.snippet,
              ai_drafted: false,
              external_id: msg.id,
              synced_from: "gmail_sync",
              sent_at: msg.dateIso,
              purpose: null,
            },
            { onConflict: "coach_id,external_id", ignoreDuplicates: true }
          );
        if (!insertErr) synced++;
      }
    }

    // Update last_synced_at to now (not the message dates, since the OVERLAP
    // window catches anything we might have missed near the boundary).
    await supabase
      .from("cp_coach_integrations")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", integration.id);

    return json({
      ok: true,
      messages_found: messageIds.length,
      messages_matched: matched,
      messages_synced: synced,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// ---------- helpers ----------

async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId = Deno.env.get("GOOGLE_GMAIL_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_GMAIL_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    console.error("Token refresh failed:", res.status, await res.text());
    return null;
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}

async function fetchMessage(
  id: string,
  accessToken: string
): Promise<
  | {
      id: string;
      headers: Record<string, string>;
      snippet: string;
      dateIso: string | null;
    }
  | null
> {
  const url = new URL(`${GMAIL_BASE}/messages/${id}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "From");
  url.searchParams.append("metadataHeaders", "To");
  url.searchParams.append("metadataHeaders", "Subject");
  url.searchParams.append("metadataHeaders", "Date");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.warn(`Gmail get failed for ${id}: ${res.status}`);
    return null;
  }
  const data = (await res.json()) as {
    id: string;
    snippet?: string;
    internalDate?: string;
    payload?: { headers?: Array<{ name: string; value: string }> };
  };

  const headers: Record<string, string> = {};
  for (const h of data.payload?.headers ?? []) {
    headers[h.name.toLowerCase()] = h.value;
  }
  const dateIso = data.internalDate
    ? new Date(parseInt(data.internalDate, 10)).toISOString()
    : null;

  return {
    id: data.id,
    headers,
    snippet: data.snippet ?? "",
    dateIso,
  };
}

/** Pulls "user@host" out of "Display Name <user@host>" or returns the input
 *  trimmed + lowercased if it's already a bare email. Returns null on junk. */
function extractEmail(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  const email = (m ? m[1] : raw).trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
