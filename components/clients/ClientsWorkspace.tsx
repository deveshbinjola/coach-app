"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarDays,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  FileText,
  Plus,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import {
  PAIN_SIGNAL_LABEL,
  type ClientEvent,
  type ClientResource,
  type ClientRoom,
  type ClientSession,
  type ClientTask,
  type Lead,
} from "@/lib/types";

type Props = {
  coachId: string;
  leads: Lead[];
  rooms: ClientRoom[];
  sessions: ClientSession[];
  tasks: ClientTask[];
  resources: ClientResource[];
  events: ClientEvent[];
};

export default function ClientsWorkspace({
  coachId,
  leads,
  rooms: initialRooms,
  sessions: initialSessions,
  tasks: initialTasks,
  resources: initialResources,
  events: initialEvents,
}: Props) {
  const supabase = createClient();
  const [rooms, setRooms] = useState(initialRooms);
  const [sessions, setSessions] = useState(initialSessions);
  const [tasks, setTasks] = useState(initialTasks);
  const [resources, setResources] = useState(initialResources);
  const [events, setEvents] = useState(initialEvents);
  const [selectedLeadId, setSelectedLeadId] = useState(leads[0]?.id ?? "");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionNote, setSessionNote] = useState("");
  const [sessionTitle, setSessionTitle] = useState("Session note");
  const [taskTitle, setTaskTitle] = useState("");
  const [resourceTitle, setResourceTitle] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [eventTitle, setEventTitle] = useState("Next session");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [copiedFollowUpId, setCopiedFollowUpId] = useState<string | null>(null);

  const roomByLeadId = useMemo(
    () => new Map(rooms.map((room) => [room.lead_id, room])),
    [rooms]
  );
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? leads[0] ?? null;
  const selectedRoom = selectedLead ? roomByLeadId.get(selectedLead.id) ?? null : null;
  const activeTasks = selectedRoom
    ? tasks.filter((task) => task.client_room_id === selectedRoom.id && task.status === "open")
    : [];
  const doneTasks = selectedRoom
    ? tasks.filter((task) => task.client_room_id === selectedRoom.id && task.status === "done")
    : [];
  const roomSessions = selectedRoom
    ? sessions.filter((session) => session.client_room_id === selectedRoom.id)
    : [];
  const roomResources = selectedRoom
    ? resources.filter((resource) => resource.client_room_id === selectedRoom.id)
    : [];
  const roomEvents = selectedRoom
    ? events.filter((event) => event.client_room_id === selectedRoom.id)
    : [];
  const upcomingEvents = roomEvents.filter((event) => new Date(event.starts_at).getTime() >= Date.now());
  const nextEvent = upcomingEvents[0] ?? null;
  const nextSessionIso = nextEvent?.starts_at ?? selectedRoom?.next_session_at ?? null;
  const nextSession = nextSessionIso
    ? new Date(nextSessionIso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "Not set";

  async function createRoom(lead: Lead) {
    setSaving(`room:${lead.id}`);
    setError(null);
    const { data, error } = await supabase
      .from("cp_client_rooms")
      .insert({
        coach_id: coachId,
        lead_id: lead.id,
        program_name: "Coaching container",
        current_focus: lead.fit_notes || lead.notes || "Create the first-session plan.",
      })
      .select()
      .single();
    setSaving(null);
    if (error) {
      setError(error.message);
      return;
    }
    setRooms((current) => [data as ClientRoom, ...current]);
  }

  async function updateRoom(patch: Partial<ClientRoom>) {
    if (!selectedRoom) return;
    setSaving("room:update");
    setError(null);
    const { data, error } = await supabase
      .from("cp_client_rooms")
      .update(patch)
      .eq("id", selectedRoom.id)
      .select()
      .single();
    setSaving(null);
    if (error) {
      setError(error.message);
      return;
    }
    setRooms((current) =>
      current.map((room) => (room.id === selectedRoom.id ? (data as ClientRoom) : room))
    );
  }

  async function addSession() {
    if (!selectedRoom || !sessionNote.trim()) return;
    setSaving("session");
    setError(null);
    const response = await fetch("/api/clients/session-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientRoomId: selectedRoom.id,
        title: sessionTitle.trim() || "Session note",
        notes: sessionNote.trim(),
      }),
    });
    const payload = await response.json();
    setSaving(null);
    if (!response.ok) {
      setError(String(payload?.error ?? "Could not save session memory."));
      return;
    }
    if (payload.room) {
      setRooms((current) =>
        current.map((room) => (room.id === selectedRoom.id ? (payload.room as ClientRoom) : room))
      );
    }
    setSessions((current) => [payload.session as ClientSession, ...current]);
    if (Array.isArray(payload.tasks) && payload.tasks.length > 0) {
      setTasks((current) => [...(payload.tasks as ClientTask[]), ...current]);
    }
    setSessionNote("");
    setSessionTitle("Session note");
  }

  async function addTask() {
    if (!selectedRoom || !taskTitle.trim()) return;
    setSaving("task");
    setError(null);
    const { data, error } = await supabase
      .from("cp_client_tasks")
      .insert({
        coach_id: coachId,
        client_room_id: selectedRoom.id,
        title: taskTitle.trim(),
      })
      .select()
      .single();
    setSaving(null);
    if (error) {
      setError(error.message);
      return;
    }
    setTasks((current) => [data as ClientTask, ...current]);
    setTaskTitle("");
  }

  async function toggleTask(task: ClientTask) {
    const done = task.status !== "done";
    const { data, error } = await supabase
      .from("cp_client_tasks")
      .update({
        status: done ? "done" : "open",
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq("id", task.id)
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? (data as ClientTask) : item))
    );
  }

  async function addResource() {
    if (!selectedRoom || !resourceTitle.trim()) return;
    setSaving("resource");
    setError(null);
    const { data, error } = await supabase
      .from("cp_client_resources")
      .insert({
        coach_id: coachId,
        client_room_id: selectedRoom.id,
        title: resourceTitle.trim(),
        url: resourceUrl.trim() || null,
      })
      .select()
      .single();
    setSaving(null);
    if (error) {
      setError(error.message);
      return;
    }
    setResources((current) => [data as ClientResource, ...current]);
    setResourceTitle("");
    setResourceUrl("");
  }

  async function addEvent() {
    if (!selectedRoom || !eventStartsAt) return;
    setSaving("event");
    setError(null);
    const startsAt = new Date(eventStartsAt).toISOString();
    const { data, error } = await supabase
      .from("cp_client_events")
      .insert({
        coach_id: coachId,
        client_room_id: selectedRoom.id,
        title: eventTitle.trim() || "Next session",
        starts_at: startsAt,
        meeting_url: eventUrl.trim() || null,
        source: "manual",
      })
      .select()
      .single();
    if (error) {
      setSaving(null);
      setError(error.message);
      return;
    }
    const { data: roomData } = await supabase
      .from("cp_client_rooms")
      .update({ next_session_at: startsAt })
      .eq("id", selectedRoom.id)
      .select()
      .single();
    setSaving(null);
    setEvents((current) => [...current, data as ClientEvent].sort(sortEvents));
    if (roomData) {
      setRooms((current) =>
        current.map((room) => (room.id === selectedRoom.id ? (roomData as ClientRoom) : room))
      );
    }
    setEventTitle("Next session");
    setEventStartsAt("");
    setEventUrl("");
  }

  async function copyFollowUp(session: ClientSession) {
    if (!session.follow_up_draft) return;
    await navigator.clipboard.writeText(session.follow_up_draft);
    setCopiedFollowUpId(session.id);
    window.setTimeout(() => setCopiedFollowUpId(null), 1600);
  }

  if (leads.length === 0) {
    return <EmptyClients />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 shadow-[var(--shadow-xs)]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Badge tone="brand" size="xs" uppercase>
            Client Rooms
          </Badge>
          <span className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
            Keep the relationship moving after the sale.
          </span>
          <div className="flex items-center gap-4 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            <span><b className="text-[color:var(--text)]">{leads.length}</b> clients</span>
            <span><b className="text-[color:var(--text)]">{tasks.filter((task) => task.status === "open").length}</b> open tasks</span>
            <span><b className="text-[color:var(--text)]">{rooms.length}</b> rooms</span>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-[length:var(--t-caption)] font-bold text-[color:var(--danger)]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <Card padding="none" className="overflow-hidden">
          <div className="border-b border-[var(--border-faint)] px-4 py-4">
            <h2 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">
              Clients
            </h2>
            <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              People who crossed from lead to client.
            </p>
          </div>
          <div className="divide-y divide-[var(--border-faint)]">
            {leads.map((lead) => {
              const room = roomByLeadId.get(lead.id);
              const active = selectedLead?.id === lead.id;
              const openTaskCount = room
                ? tasks.filter((task) => task.client_room_id === room.id && task.status === "open").length
                : 0;
              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => setSelectedLeadId(lead.id)}
                  className={`block w-full px-4 py-4 text-left transition ${
                    active ? "bg-[var(--brand-soft)]" : "hover:bg-[var(--surface-deep)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
                        {lead.full_name}
                      </p>
                      <p className="mt-1 truncate text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                        {lead.pain_signal[0] ? PAIN_SIGNAL_LABEL[lead.pain_signal[0]] : "Client"}
                      </p>
                    </div>
                    <Badge tone={room ? "brand" : "warning"} size="xs">
                      {room ? `${openTaskCount} tasks` : "No room"}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {selectedLead ? (
          selectedRoom ? (
            <section className="min-w-0 space-y-5">
              <Card className="space-y-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand" size="xs" uppercase>
                        Active client
                      </Badge>
                    </div>
                    <h2 className="mt-3 break-words text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)]">
                      {selectedLead.full_name}
                    </h2>
                    <p className="mt-2 max-w-2xl text-[length:var(--t-body)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
                      {selectedRoom.current_focus || "Set the current focus before the next session."}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:min-w-[360px]">
                    <RoomMetric icon={<CalendarDays size={15} />} label="Next session" value={nextSession} />
                    <RoomMetric icon={<ClipboardList size={15} />} label="Open tasks" value={String(activeTasks.length)} />
                    <RoomMetric icon={<FileText size={15} />} label="Notes" value={String(roomSessions.length)} />
                  </div>
                </div>

                <div className="grid gap-3">
                  <label className="space-y-1">
                    <span className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                      Current focus
                    </span>
                    <textarea
                      value={selectedRoom.current_focus ?? ""}
                      onChange={(event) =>
                        setRooms((current) =>
                          current.map((room) =>
                            room.id === selectedRoom.id
                              ? { ...room, current_focus: event.target.value }
                              : room
                          )
                        )
                      }
                      onBlur={(event) => updateRoom({ current_focus: event.target.value })}
                      rows={3}
                      className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[length:var(--t-body)] text-[color:var(--text)] outline-none focus:border-[var(--brand-strong)]"
                      placeholder="What are they working through right now?"
                    />
                  </label>
                </div>
              </Card>

              <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
                <div className="space-y-5">
                  <Card className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">
                          Session memory
                        </h3>
                        <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                          Paste notes or a transcript. The room pulls out the next move.
                        </p>
                      </div>
                      <Sparkles size={17} className="text-[color:var(--brand-strong)]" aria-hidden />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                      <input
                        value={sessionTitle}
                        onChange={(event) => setSessionTitle(event.target.value)}
                        className="min-h-11 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
                        placeholder="Session title"
                      />
                      <textarea
                        value={sessionNote}
                        onChange={(event) => setSessionNote(event.target.value)}
                        rows={4}
                        className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[length:var(--t-body)] outline-none focus:border-[var(--brand-strong)]"
                        placeholder="What changed? What did they commit to? What needs follow-up?"
                      />
                    </div>
                    <Button
                      onClick={addSession}
                      disabled={!sessionNote.trim() || saving === "session"}
                      leadingIcon={<Plus size={15} />}
                    >
                      {saving === "session" ? "Extracting..." : "Add session memory"}
                    </Button>
                  </Card>

                  <Card padding="none" className="overflow-hidden">
                    <div className="border-b border-[var(--border-faint)] px-4 py-4 sm:px-5">
                      <h3 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">
                        Timeline
                      </h3>
                    </div>
                    {roomSessions.length === 0 ? (
                      <p className="px-5 py-8 text-center text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                        No session notes yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-[var(--border-faint)]">
                        {roomSessions.map((session) => (
                          <article key={session.id} className="px-4 py-4 sm:px-5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
                                {session.title}
                              </h4>
                              <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-faint)]">
                                {new Date(session.session_at).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
                              {session.notes}
                            </p>
                            {(session.wins.length > 0 ||
                              session.blockers.length > 0 ||
                              session.commitments.length > 0 ||
                              session.content_ideas.length > 0) && (
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <MemoryList title="Wins" items={session.wins} />
                                <MemoryList title="Blockers" items={session.blockers} />
                                <MemoryList title="Homework" items={session.commitments} />
                                <MemoryList title="Content seeds" items={session.content_ideas} />
                              </div>
                            )}
                            {session.follow_up_draft ? (
                              <div className="mt-3 rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-deep)] p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                                    Follow-up draft
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyFollowUp(session)}
                                    leadingIcon={<Copy size={13} />}
                                  >
                                    {copiedFollowUpId === session.id ? "Copied" : "Copy"}
                                  </Button>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text)]">
                                  {session.follow_up_draft}
                                </p>
                              </div>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>

                <aside className="space-y-5">
                  <Card className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">
                        Calendar
                      </h3>
                      <Badge tone="info" size="xs">
                        Cal.com ready
                      </Badge>
                    </div>
                    <p className="text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
                      Add the next session now. Cal.com, Google Calendar, and Zoom can feed this later.
                    </p>
                    <input
                      value={eventTitle}
                      onChange={(event) => setEventTitle(event.target.value)}
                      className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
                      placeholder="Session title"
                    />
                    <input
                      type="datetime-local"
                      value={eventStartsAt}
                      onChange={(event) => setEventStartsAt(event.target.value)}
                      className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
                    />
                    <input
                      value={eventUrl}
                      onChange={(event) => setEventUrl(event.target.value)}
                      className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
                      placeholder="Zoom or Cal.com link"
                    />
                    <Button
                      onClick={addEvent}
                      disabled={!eventStartsAt || saving === "event"}
                      leadingIcon={<CalendarDays size={15} />}
                      block
                    >
                      {saving === "event" ? "Adding..." : "Add session"}
                    </Button>
                    <div className="space-y-2">
                      {roomEvents.length === 0 ? (
                        <p className="rounded-[var(--r-md)] bg-[var(--surface-deep)] px-3 py-3 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                          No sessions scheduled.
                        </p>
                      ) : (
                        roomEvents.slice(0, 4).map((event) => (
                          <div
                            key={event.id}
                            className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface)] px-3 py-3"
                          >
                            <div className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                              {event.title}
                            </div>
                            <div className="mt-1 text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
                              {new Date(event.starts_at).toLocaleString("en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </div>
                            {event.meeting_url ? (
                              <a
                                href={event.meeting_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex text-[length:var(--t-caption)] font-bold text-[color:var(--success)] hover:underline"
                              >
                                Open meeting link
                              </a>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </Card>

                  <Card className="space-y-3">
                    <h3 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">
                      Homework
                    </h3>
                    <div className="flex gap-2">
                      <input
                        value={taskTitle}
                        onChange={(event) => setTaskTitle(event.target.value)}
                        className="min-h-11 min-w-0 flex-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
                        placeholder="Add action item"
                      />
                      <Button
                        onClick={addTask}
                        disabled={!taskTitle.trim() || saving === "task"}
                        className="shrink-0"
                      >
                        Add
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {activeTasks.length === 0 ? (
                        <p className="rounded-[var(--r-md)] bg-[var(--surface-deep)] px-3 py-3 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                          No open homework.
                        </p>
                      ) : (
                        activeTasks.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => toggleTask(task)}
                            className="flex w-full items-start gap-2 rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface)] px-3 py-3 text-left transition hover:border-[var(--border-strong)]"
                          >
                            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--r-sm)] border border-[var(--brand)] text-[color:var(--brand-strong)]" />
                            <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
                              {task.title}
                            </span>
                          </button>
                        ))
                      )}
                      {doneTasks.slice(0, 3).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => toggleTask(task)}
                          className="flex w-full items-start gap-2 rounded-[var(--r-md)] bg-[var(--surface-deep)] px-3 py-2 text-left opacity-70"
                        >
                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--brand)] text-[color:var(--navy)]">
                            <Check size={13} aria-hidden />
                          </span>
                          <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] line-through">
                            {task.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </Card>

                  <Card className="space-y-3">
                    <h3 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">
                      Resources
                    </h3>
                    <input
                      value={resourceTitle}
                      onChange={(event) => setResourceTitle(event.target.value)}
                      className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
                      placeholder="Resource title"
                    />
                    <input
                      value={resourceUrl}
                      onChange={(event) => setResourceUrl(event.target.value)}
                      className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
                      placeholder="https://..."
                    />
                    <Button
                      onClick={addResource}
                      disabled={!resourceTitle.trim() || saving === "resource"}
                      leadingIcon={<Plus size={15} />}
                      block
                    >
                      Add resource
                    </Button>
                    <div className="space-y-2">
                      {roomResources.length === 0 ? (
                        <p className="rounded-[var(--r-md)] bg-[var(--surface-deep)] px-3 py-3 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                          No resources yet.
                        </p>
                      ) : (
                        roomResources.map((resource) => (
                          <a
                            key={resource.id}
                            href={resource.url || "#"}
                            target={resource.url ? "_blank" : undefined}
                            rel={resource.url ? "noreferrer" : undefined}
                            className="flex items-center justify-between gap-3 rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface)] px-3 py-3 text-[length:var(--t-caption)] font-bold text-[color:var(--text)] hover:border-[var(--border-strong)]"
                          >
                            <span className="min-w-0 truncate">{resource.title}</span>
                            {resource.url ? <ExternalLink size={14} aria-hidden /> : null}
                          </a>
                        ))
                      )}
                    </div>
                  </Card>
                </aside>
              </div>
            </section>
          ) : (
            <Card className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <Badge tone="warning" size="xs" uppercase>
                Room not created
              </Badge>
              <h2 className="mt-4 text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)]">
                Create {selectedLead.full_name}'s client room.
              </h2>
              <p className="mt-2 max-w-md text-[length:var(--t-body)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
                This becomes the home for notes, homework, resources, and their next session focus.
              </p>
              <Button
                onClick={() => createRoom(selectedLead)}
                disabled={saving === `room:${selectedLead.id}`}
                leadingIcon={<Plus size={15} />}
                className="mt-5"
              >
                Create client room
              </Button>
            </Card>
          )
        ) : null}
      </div>
    </div>
  );
}

function EmptyClients() {
  return (
    <Card className="min-h-[520px] flex flex-col items-center justify-center text-center">
      <Badge tone="muted" size="xs" uppercase>
        No clients yet
      </Badge>
      <h1 className="mt-4 max-w-xl text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)]">
        Client rooms unlock when a lead becomes a client.
      </h1>
      <p className="mt-2 max-w-lg text-[length:var(--t-body)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
        Move a lead to client from the lead detail page. Then come back here to run the relationship.
      </p>
      <a
        href="/inbox"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[var(--r-md)] bg-[var(--brand)] px-5 text-[length:var(--t-caption)] font-extrabold text-[color:var(--navy)] transition hover:bg-[var(--brand-strong)]"
      >
        Go to leads
      </a>
    </Card>
  );
}

function RoomMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface)] p-3">
      <div className="flex items-center gap-1.5 text-[color:var(--text-muted)]">
        {icon}
        <span className="text-[10px] font-extrabold uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 truncate text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
        {value}
      </div>
    </div>
  );
}

function MemoryList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-[var(--r-md)] bg-[var(--surface-deep)] p-3">
      <div className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
        {title}
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li
            key={item}
            className="text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function sortEvents(a: ClientEvent, b: ClientEvent) {
  return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
}
