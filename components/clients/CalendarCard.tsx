"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { ClientEvent, ClientRoom } from "@/lib/types";

type Props = {
  coachId: string;
  room: ClientRoom;
  events: ClientEvent[];
  onEventAdded: (event: ClientEvent, room: ClientRoom) => void;
  onError: (message: string) => void;
};

export default function CalendarCard({ coachId, room, events, onEventAdded, onError }: Props) {
  const supabase = createClient();
  const [title, setTitle] = useState("Next session");
  const [startsAt, setStartsAt] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function addEvent() {
    if (!startsAt) return;
    setSaving(true);
    const isoStartsAt = new Date(startsAt).toISOString();
    const { data, error } = await supabase
      .from("cp_client_events")
      .insert({
        coach_id: coachId,
        client_room_id: room.id,
        title: title.trim() || "Next session",
        starts_at: isoStartsAt,
        meeting_url: url.trim() || null,
        source: "manual",
      })
      .select()
      .single();
    if (error) {
      setSaving(false);
      onError(error.message);
      return;
    }
    const { data: roomData } = await supabase
      .from("cp_client_rooms")
      .update({ next_session_at: isoStartsAt })
      .eq("id", room.id)
      .select()
      .single();
    setSaving(false);
    onEventAdded(data as ClientEvent, roomData as ClientRoom);
    setTitle("Next session");
    setStartsAt("");
    setUrl("");
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">Calendar</h3>
        <Badge tone="info" size="xs">Cal.com ready</Badge>
      </div>
      <p className="text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
        Add the next session now. Cal.com, Google Calendar, and Zoom can feed this later.
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
        placeholder="Session title"
      />
      <input
        type="datetime-local"
        value={startsAt}
        onChange={(e) => setStartsAt(e.target.value)}
        className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
        placeholder="Zoom or Cal.com link"
      />
      <Button onClick={addEvent} disabled={!startsAt || saving} leadingIcon={<CalendarDays size={15} />} block>
        {saving ? "Adding..." : "Add session"}
      </Button>
      <div className="space-y-2">
        {events.length === 0 ? (
          <p className="rounded-[var(--r-md)] bg-[var(--surface-deep)] px-3 py-3 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            No sessions scheduled.
          </p>
        ) : (
          events.slice(0, 4).map((event) => (
            <div key={event.id} className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface)] px-3 py-3">
              <div className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">{event.title}</div>
              <div className="mt-1 text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
                {new Date(event.starts_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
              {event.meeting_url ? (
                <a href={event.meeting_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[length:var(--t-caption)] font-bold text-[color:var(--success)] hover:underline">
                  Open meeting link
                </a>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
