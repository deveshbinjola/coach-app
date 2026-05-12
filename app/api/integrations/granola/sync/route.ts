import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { extractSessionMemory } from "@/lib/session-memory";
import type { ClientRoom, Lead, VoiceProfile } from "@/lib/types";

export const runtime = "edge";

const GRANOLA_API_BASE = "https://public-api.granola.ai/v1";

type GranolaNote = {
  id: string;
  title: string;
  created_at: string | null;
  attendees: Array<{ name: string | null; email: string | null }>;
  body: string;
  raw: Record<string, unknown>;
};

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [integrationRes, leadsRes, roomsRes, profileRes] = await Promise.all([
    supabase
      .from("cp_coach_integrations")
      .select("*")
      .eq("coach_id", user.id)
      .eq("provider", "granola")
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("cp_leads")
      .select("*")
      .eq("coach_id", user.id)
      .eq("status", "client"),
    supabase
      .from("cp_client_rooms")
      .select("*")
      .eq("coach_id", user.id),
    supabase
      .from("cp_voice_profiles")
      .select("*")
      .eq("coach_id", user.id)
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const apiKey = String(integrationRes.data?.refresh_token ?? "");
  if (!apiKey) {
    return NextResponse.json({ error: "Connect Granola first." }, { status: 400 });
  }

  const leads = (leadsRes.data as Lead[] | null) ?? [];
  const rooms = (roomsRes.data as ClientRoom[] | null) ?? [];
  const profile = (profileRes.data as VoiceProfile | null) ?? null;
  const notes = await fetchGranolaNotes(apiKey);

  let imported = 0;
  let skipped = 0;
  const unmatched: Array<{ id: string; title: string }> = [];

  for (const note of notes) {
    const room = matchRoom(note, leads, rooms);
    if (!room) {
      unmatched.push({ id: note.id, title: note.title });
      continue;
    }

    const { data: existing } = await supabase
      .from("cp_client_sessions")
      .select("id")
      .eq("coach_id", user.id)
      .eq("external_source", "granola")
      .eq("external_id", note.id)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }

    const extraction = await extractSessionMemory({
      notes: note.body,
      title: note.title,
      clientName: leadNameForRoom(room, leads),
      currentFocus: room.current_focus,
      profile,
    });

    const { error } = await supabase
      .from("cp_client_sessions")
      .insert({
        coach_id: user.id,
        client_room_id: room.id,
        title: extraction.title || note.title,
        session_at: note.created_at ?? new Date().toISOString(),
        notes: note.body,
        wins: extraction.wins,
        blockers: extraction.blockers,
        commitments: extraction.commitments,
        next_focus: extraction.next_focus,
        follow_up_draft: extraction.follow_up_draft,
        content_ideas: extraction.content_ideas,
        external_source: "granola",
        external_id: note.id,
        extraction_source: extraction.extraction_source,
      });

    if (error) {
      skipped += 1;
      continue;
    }

    if (extraction.commitments.length > 0) {
      await supabase.from("cp_client_tasks").insert(
        extraction.commitments.slice(0, 5).map((commitment) => ({
          coach_id: user.id,
          client_room_id: room.id,
          title: commitment,
        }))
      );
    }

    await supabase
      .from("cp_client_rooms")
      .update({ current_focus: extraction.next_focus || room.current_focus })
      .eq("id", room.id);
    imported += 1;
  }

  await supabase
    .from("cp_coach_integrations")
    .update({
      last_synced_at: new Date().toISOString(),
      metadata: {
        last_sync: {
          imported,
          skipped,
          unmatched: unmatched.length,
          checked: notes.length,
        },
      },
    })
    .eq("coach_id", user.id)
    .eq("provider", "granola");

  return NextResponse.json({
    ok: true,
    checked: notes.length,
    imported,
    skipped,
    unmatched,
  });
}

async function fetchGranolaNotes(apiKey: string) {
  const response = await fetch(`${GRANOLA_API_BASE}/notes?page_size=25`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error("Granola notes request failed");
  const payload = await response.json();
  const rawNotes = normalizeNoteList(payload).slice(0, 25);
  const notes: GranolaNote[] = [];
  for (const raw of rawNotes) {
    const listNote = normalizeNote(raw);
    if (!listNote) continue;
    const detail = await fetchGranolaNote(apiKey, listNote.id);
    notes.push(detail ?? listNote);
  }
  return notes;
}

async function fetchGranolaNote(apiKey: string, id: string) {
  const response = await fetch(`${GRANOLA_API_BASE}/notes/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) return null;
  return normalizeNote(await response.json());
}

function normalizeNote(value: unknown): GranolaNote | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id) || stringValue(value.document_id) || stringValue(value.note_id);
  if (!id) return null;
  const title = stringValue(value.title) || stringValue(value.name) || "Granola note";
  const createdAt =
    stringValue(value.created_at) ||
    stringValue(value.createdAt) ||
    stringValue(value.started_at) ||
    stringValue(value.meeting_start);
  const attendees = extractAttendees(value);
  const body =
    stringValue(value.markdown) ||
    stringValue(value.notes) ||
    stringValue(value.summary) ||
    stringValue(value.transcript) ||
    safeJson(value);

  return {
    id,
    title,
    created_at: createdAt ? toIso(createdAt) : null,
    attendees,
    body,
    raw: value,
  };
}

function normalizeNoteList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  const candidates = [payload.notes, payload.data, payload.results, payload.items];
  return candidates.find(Array.isArray) ?? [];
}

function extractAttendees(note: Record<string, unknown>) {
  const raw =
    arrayValue(note.attendees) ||
    arrayValue(note.participants) ||
    arrayValue(note.people) ||
    arrayValue(note.users) ||
    [];

  return raw.filter(isRecord).map((person) => ({
    name: stringValue(person.name) || stringValue(person.display_name),
    email: stringValue(person.email) || stringValue(person.email_address),
  }));
}

function matchRoom(note: GranolaNote, leads: Lead[], rooms: ClientRoom[]) {
  const byLeadId = new Map(rooms.map((room) => [room.lead_id, room]));
  const attendeeEmails = new Set(
    note.attendees.map((attendee) => attendee.email?.toLowerCase()).filter(Boolean)
  );
  const leadByEmail = leads.find((lead) => lead.email && attendeeEmails.has(lead.email.toLowerCase()));
  if (leadByEmail) return byLeadId.get(leadByEmail.id) ?? null;

  const title = note.title.toLowerCase();
  const leadByName = leads.find((lead) => title.includes(lead.full_name.toLowerCase()));
  if (leadByName) return byLeadId.get(leadByName.id) ?? null;
  return null;
}

function leadNameForRoom(room: ClientRoom, leads: Lead[]) {
  return leads.find((lead) => lead.id === room.lead_id)?.full_name ?? "the client";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : null;
}

function toIso(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2).slice(0, 12000);
  } catch {
    return "";
  }
}
