// Public session webhook receiver for Cal.com, Calendly, and Zoom.
//
// The URL token is the credential. Calendar bookings are matched to client
// rooms by attendee email. Zoom recording events are attached when the
// meeting id or topic can be matched to an existing client event.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getFreshZoomAccessToken } from "@/lib/integration-refresh";

export const runtime = "edge";

type Provider = "cal_com" | "calendly" | "zoom";
type EndpointRow = {
  id: string;
  coach_id: string;
  provider: Provider;
  total_received: number;
};

type SessionPayload = {
  title: string;
  starts_at: string | null;
  attendee_name: string | null;
  attendee_email: string | null;
  meeting_url: string | null;
  external_id: string | null;
  kind: "booking" | "zoom_recording";
  transcript_url: string | null;
  raw_summary: string;
};

const PROVIDERS: Provider[] = ["cal_com", "calendly", "zoom"];

export async function POST(
  request: NextRequest,
  { params }: { params: { provider: string; token: string } }
) {
  const provider = PROVIDERS.find((item) => item === params.provider);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: endpoint } = await admin
    .from("cp_session_webhook_endpoints")
    .select("id, coach_id, provider, total_received")
    .eq("token", params.token)
    .eq("provider", provider)
    .eq("active", true)
    .maybeSingle();

  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint not found or inactive" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (provider === "zoom" && isZoomValidation(payload)) {
    return handleZoomValidation(payload);
  }

  const extracted = extractSession(provider, payload);
  if (!extracted) {
    await bumpEndpoint(admin, endpoint as EndpointRow);
    return NextResponse.json({
      ok: true,
      skipped: "unsupported_event",
    });
  }

  const result =
    extracted.kind === "zoom_recording"
      ? await attachZoomRecording(admin, endpoint as EndpointRow, extracted)
      : await upsertBooking(admin, endpoint as EndpointRow, provider, extracted);

  await bumpEndpoint(admin, endpoint as EndpointRow);
  return NextResponse.json(result, { status: result.ok ? 201 : 202 });
}

function extractSession(provider: Provider, payload: unknown): SessionPayload | null {
  if (!isRecord(payload)) return null;
  if (provider === "cal_com") return extractCalCom(payload);
  if (provider === "calendly") return extractCalendly(payload);
  return extractZoom(payload);
}

function extractCalCom(payload: Record<string, unknown>): SessionPayload | null {
  const trigger = stringValue(payload.triggerEvent) || stringValue(payload.event) || "";
  if (trigger && !/created|rescheduled|booking/i.test(trigger)) return null;

  const body = isRecord(payload.payload) ? payload.payload : payload;
  const attendees = arrayValue(body.attendees);
  const firstAttendee = attendees.find(isRecord) as Record<string, unknown> | undefined;
  const start =
    stringValue(body.startTime) ||
    stringValue(body.start_time) ||
    stringValue(body.start) ||
    stringValue(body.startsAt);
  const title =
    stringValue(body.title) ||
    stringValue(body.eventTypeTitle) ||
    stringValue(body.event_type_title) ||
    "Cal.com session";
  const meetingUrl =
    stringValue(body.location) ||
    stringValue(body.meetingUrl) ||
    stringValue(body.meeting_url) ||
    stringValue(body.videoCallUrl);

  return {
    title,
    starts_at: start ? toIso(start) : null,
    attendee_name:
      stringValue(firstAttendee?.name) ||
      stringValue(body.attendeeName) ||
      stringValue(body.name),
    attendee_email:
      stringValue(firstAttendee?.email) ||
      stringValue(body.attendeeEmail) ||
      stringValue(body.email),
    meeting_url: meetingUrl,
    external_id: stringValue(body.uid) || stringValue(body.id) || stringValue(body.bookingId),
    kind: "booking",
    transcript_url: null,
    raw_summary: safeJson(payload),
  };
}

function extractCalendly(payload: Record<string, unknown>): SessionPayload | null {
  const event = stringValue(payload.event) || "";
  if (event && !/invitee\.created|invitee\.canceled/i.test(event)) return null;
  if (/canceled/i.test(event)) return null;

  const body = isRecord(payload.payload) ? payload.payload : payload;
  const scheduled = isRecord(body.scheduled_event) ? body.scheduled_event : {};
  const location = isRecord(scheduled.location) ? scheduled.location : {};
  const start = stringValue(scheduled.start_time) || stringValue(body.start_time);
  const title = stringValue(scheduled.name) || stringValue(body.event_type_name) || "Calendly session";

  return {
    title,
    starts_at: start ? toIso(start) : null,
    attendee_name: stringValue(body.name),
    attendee_email: stringValue(body.email),
    meeting_url: stringValue(location.join_url) || stringValue(location.location),
    external_id: stringValue(scheduled.uri) || stringValue(body.uri),
    kind: "booking",
    transcript_url: null,
    raw_summary: safeJson(payload),
  };
}

function extractZoom(payload: Record<string, unknown>): SessionPayload | null {
  const event = stringValue(payload.event) || "";
  if (!/recording\.completed|recording\.transcript_completed|meeting\.ended/i.test(event)) {
    return null;
  }
  const object = isRecord(payload.payload)
    ? isRecord(payload.payload.object)
      ? payload.payload.object
      : payload.payload
    : payload;
  const files = arrayValue(object.recording_files).filter(isRecord) as Record<string, unknown>[];
  const transcript = files.find((file) =>
    /TRANSCRIPT|CHAT/i.test(stringValue(file.file_type) || "")
  );
  const start = stringValue(object.start_time) || stringValue(object.startTime);
  const title = stringValue(object.topic) || "Zoom recording";

  return {
    title,
    starts_at: start ? toIso(start) : new Date().toISOString(),
    attendee_name: null,
    attendee_email: stringValue(object.host_email),
    meeting_url: stringValue(object.share_url) || stringValue(object.join_url),
    external_id: stringValue(object.id) || stringValue(object.uuid),
    kind: "zoom_recording",
    transcript_url: transcript ? stringValue(transcript.download_url) : null,
    raw_summary: safeJson(payload),
  };
}

async function upsertBooking(
  admin: ReturnType<typeof createAdminClient>,
  endpoint: EndpointRow,
  provider: Provider,
  session: SessionPayload
) {
  if (!session.starts_at) {
    return { ok: false, skipped: "missing_start_time", session };
  }

  const room = await findOrCreateRoomForEmail(admin, endpoint.coach_id, session);
  if (!room) {
    return {
      ok: false,
      skipped: "no_client_match",
      hint: "Add the client lead with the same email, or convert the lead to client first.",
      session,
    };
  }

  const eventRow = {
    coach_id: endpoint.coach_id,
    client_room_id: room.id,
    title: session.title,
    starts_at: session.starts_at,
    meeting_url: session.meeting_url,
    source: provider,
    external_id: session.external_id,
  };

  const existing = session.external_id
    ? await admin
        .from("cp_client_events")
        .select("id")
        .eq("coach_id", endpoint.coach_id)
        .eq("external_id", session.external_id)
        .maybeSingle()
    : { data: null };

  const write = existing.data?.id
    ? admin
        .from("cp_client_events")
        .update(eventRow)
        .eq("id", existing.data.id)
        .select("*")
        .single()
    : admin
        .from("cp_client_events")
        .insert(eventRow)
        .select("*")
        .single();

  const { data: event, error } = await write;

  if (error) return { ok: false, error: error.message };

  await admin
    .from("cp_client_rooms")
    .update({ next_session_at: session.starts_at })
    .eq("id", room.id);

  return { ok: true, event };
}

async function attachZoomRecording(
  admin: ReturnType<typeof createAdminClient>,
  endpoint: EndpointRow,
  session: SessionPayload
) {
  const room = await findRoomForZoom(admin, endpoint.coach_id, session);
  if (!room) {
    return {
      ok: false,
      skipped: "no_zoom_room_match",
      hint: "Zoom sent a recording event, but no client room event matched the meeting id or topic.",
      session,
    };
  }

  const transcriptText = session.transcript_url
    ? await downloadZoomTranscript(endpoint.coach_id, session.transcript_url)
    : null;

  const { data: resource } = await admin
    .from("cp_client_resources")
    .insert({
      coach_id: endpoint.coach_id,
      client_room_id: room.id,
      title: session.transcript_url ? "Zoom transcript ready" : "Zoom recording ready",
      url: session.transcript_url || session.meeting_url,
      note: "Imported from Zoom webhook. Downloading private transcript files requires Zoom OAuth access.",
    })
    .select("*")
    .single();

  const { data: note } = await admin
    .from("cp_client_sessions")
    .insert({
      coach_id: endpoint.coach_id,
      client_room_id: room.id,
      title: transcriptText ? `${session.title} transcript` : `${session.title} recording`,
      notes:
        transcriptText ||
        [
          "Zoom recording webhook received.",
          session.transcript_url
            ? "Transcript file is available through Zoom, but OAuth download did not complete."
            : "Recording is available, but no transcript file was included.",
        ].join("\n"),
      extraction_source: transcriptText ? "fallback" : "manual",
    })
    .select("*")
    .single();

  return { ok: true, resource, session: note };
}

async function downloadZoomTranscript(coachId: string, transcriptUrl: string) {
  const token = await getFreshZoomAccessToken(coachId);
  if (!token) return null;

  const response = await fetch(transcriptUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return null;
  const text = await response.text();
  return cleanVtt(text).slice(0, 12000);
}

function cleanVtt(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^WEBVTT/i.test(line) && !/^\d+$/.test(line) && !/-->/.test(line))
    .join("\n");
}

async function findOrCreateRoomForEmail(
  admin: ReturnType<typeof createAdminClient>,
  coachId: string,
  session: SessionPayload
) {
  if (!session.attendee_email) return null;
  const { data: lead } = await admin
    .from("cp_leads")
    .select("*")
    .eq("coach_id", coachId)
    .ilike("email", session.attendee_email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lead) return null;

  await admin
    .from("cp_leads")
    .update({ status: "client" })
    .eq("id", lead.id)
    .eq("coach_id", coachId);

  const { data: existing } = await admin
    .from("cp_client_rooms")
    .select("*")
    .eq("coach_id", coachId)
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (existing) return existing;

  const { data: room } = await admin
    .from("cp_client_rooms")
    .insert({
      coach_id: coachId,
      lead_id: lead.id,
      program_name: "Coaching session",
      current_focus: lead.fit_notes || lead.notes || "Prepare for the first client session.",
    })
    .select("*")
    .single();
  return room ?? null;
}

async function findRoomForZoom(
  admin: ReturnType<typeof createAdminClient>,
  coachId: string,
  session: SessionPayload
) {
  if (session.external_id) {
    const { data: event } = await admin
      .from("cp_client_events")
      .select("client_room_id")
      .eq("coach_id", coachId)
      .eq("external_id", session.external_id)
      .maybeSingle();
    if (event?.client_room_id) {
      const { data: room } = await admin
        .from("cp_client_rooms")
        .select("*")
        .eq("id", event.client_room_id)
        .maybeSingle();
      if (room) return room;
    }
  }

  const { data: event } = await admin
    .from("cp_client_events")
    .select("client_room_id")
    .eq("coach_id", coachId)
    .ilike("title", `%${session.title}%`)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!event?.client_room_id) return null;
  const { data: room } = await admin
    .from("cp_client_rooms")
    .select("*")
    .eq("id", event.client_room_id)
    .maybeSingle();
  return room ?? null;
}

async function bumpEndpoint(admin: ReturnType<typeof createAdminClient>, endpoint: EndpointRow) {
  await admin
    .from("cp_session_webhook_endpoints")
    .update({
      last_used_at: new Date().toISOString(),
      total_received: endpoint.total_received + 1,
    })
    .eq("id", endpoint.id);
}

function isZoomValidation(payload: unknown): payload is { event: string; payload: { plainToken: string } } {
  return (
    isRecord(payload) &&
    payload.event === "endpoint.url_validation" &&
    isRecord(payload.payload) &&
    typeof payload.payload.plainToken === "string"
  );
}

async function handleZoomValidation(payload: { payload: { plainToken: string } }) {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret) {
    return NextResponse.json({ error: "Missing ZOOM_WEBHOOK_SECRET_TOKEN" }, { status: 500 });
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload.payload.plainToken)
  );
  const encryptedToken = Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return NextResponse.json({
    plainToken: payload.payload.plainToken,
    encryptedToken,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function toIso(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2).slice(0, 8000);
  } catch {
    return "{}";
  }
}
