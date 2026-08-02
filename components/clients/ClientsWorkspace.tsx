"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarDays,
  ClipboardList,
  FileText,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type {
  ClientEvent,
  ClientResource,
  ClientRoom,
  ClientSession,
  ClientTask,
  Lead,
} from "@/lib/types";
import ClientSidebar from "./ClientSidebar";
import SessionMemoryCard from "./SessionMemoryCard";
import ClientTimeline from "./ClientTimeline";
import CalendarCard from "./CalendarCard";
import HomeworkCard from "./HomeworkCard";
import ResourcesCard from "./ResourcesCard";

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
  const [clientSearch, setClientSearch] = useState("");

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
    ? new Date(nextSessionIso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
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
    if (error) { setError(error.message); return; }
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
    if (error) { setError(error.message); return; }
    setRooms((current) =>
      current.map((room) => (room.id === selectedRoom.id ? (data as ClientRoom) : room))
    );
  }

  function handleSessionAdded(session: ClientSession, newTasks: ClientTask[], room?: ClientRoom) {
    if (room && selectedRoom) {
      setRooms((current) =>
        current.map((r) => (r.id === selectedRoom.id ? (room as ClientRoom) : r))
      );
    }
    setSessions((current) => [session, ...current]);
    if (newTasks.length > 0) {
      setTasks((current) => [...newTasks, ...current]);
    }
  }

  function handleEventAdded(event: ClientEvent, room: ClientRoom) {
    setEvents((current) => [...current, event].sort(sortEvents));
    if (room) {
      setRooms((current) =>
        current.map((r) => (r.id === room.id ? room : r))
      );
    }
  }

  if (leads.length === 0) {
    return <EmptyClients />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 shadow-[var(--shadow-xs)]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Badge tone="brand" size="xs" uppercase>Client Rooms</Badge>
          <span className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
            Keep the relationship moving after the sale.
          </span>
          <div className="flex items-center gap-4 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            <span><b className="text-[color:var(--text)]">{leads.length}</b> clients</span>
            <span><b className="text-[color:var(--text)]">{tasks.filter((t) => t.status === "open").length}</b> open tasks</span>
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
        <ClientSidebar
          leads={leads}
          rooms={roomByLeadId}
          tasks={tasks}
          selectedLeadId={selectedLeadId}
          onSelectLead={setSelectedLeadId}
          search={clientSearch}
          onSearchChange={setClientSearch}
        />

        {selectedLead ? (
          selectedRoom ? (
            <section className="min-w-0 space-y-5">
              <Card className="space-y-3">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand" size="xs" uppercase>Active client</Badge>
                    </div>
                    <h2 className="mt-3 break-words text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
                      {selectedLead.full_name}
                    </h2>
                    <p className="mt-2 max-w-2xl text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
                      {selectedLead.email || "No email on file"}
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
                      onChange={(e) =>
                        setRooms((current) =>
                          current.map((room) =>
                            room.id === selectedRoom.id
                              ? { ...room, current_focus: e.target.value }
                              : room
                          )
                        )
                      }
                      onBlur={(e) => updateRoom({ current_focus: e.target.value })}
                      rows={3}
                      className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[length:var(--t-body)] text-[color:var(--text)] outline-none focus:border-[var(--brand-strong)]"
                      placeholder="What are they working through right now?"
                    />
                  </label>
                </div>
              </Card>

              <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                <div className="space-y-5">
                  <SessionMemoryCard
                    room={selectedRoom}
                    onSessionAdded={handleSessionAdded}
                    onError={setError}
                  />
                  <ClientTimeline sessions={roomSessions} />
                </div>

                <aside className="space-y-5">
                  <CalendarCard
                    coachId={coachId}
                    room={selectedRoom}
                    events={roomEvents}
                    onEventAdded={handleEventAdded}
                    onError={setError}
                  />
                  <HomeworkCard
                    coachId={coachId}
                    roomId={selectedRoom.id}
                    activeTasks={activeTasks}
                    doneTasks={doneTasks}
                    onTaskAdded={(task) => setTasks((current) => [task, ...current])}
                    onTaskToggled={(task) =>
                      setTasks((current) => current.map((t) => (t.id === task.id ? task : t)))
                    }
                    onError={setError}
                  />
                  <ResourcesCard
                    coachId={coachId}
                    roomId={selectedRoom.id}
                    resources={roomResources}
                    onResourceAdded={(r) => setResources((current) => [r, ...current])}
                    onError={setError}
                  />
                </aside>
              </div>
            </section>
          ) : (
            <Card className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <Badge tone="warning" size="xs" uppercase>Room not created</Badge>
              <h2 className="mt-4 text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
                Create {selectedLead.full_name}&apos;s client room.
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
      <Badge tone="muted" size="xs" uppercase>No clients yet</Badge>
      {/* h2, not h1. The page-level h1 is now "Clients" in the shared
          PageHeader, and two h1s on one document is a screen-reader problem. */}
      <h2 className="mt-4 max-w-xl text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
        Client rooms unlock when a lead becomes a client.
      </h2>
      <p className="mt-2 max-w-lg text-[length:var(--t-body)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
        Move a lead to client from the lead detail page. Then come back here to run the relationship.
      </p>
      <a
        href="/inbox"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[var(--r-md)] bg-[var(--brand)] px-5 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text-inverse)] transition hover:bg-[var(--brand-strong)]"
      >
        Go to leads
      </a>
    </Card>
  );
}

function RoomMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface)] p-3">
      <div className="flex items-center gap-1.5 text-[color:var(--text-muted)]">
        {icon}
        <span className="text-[length:var(--t-eyebrow)] font-extrabold uppercase tracking-[var(--tracking-eyebrow)]">{label}</span>
      </div>
      <div className="mt-2 truncate text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
        {value}
      </div>
    </div>
  );
}

function sortEvents(a: ClientEvent, b: ClientEvent) {
  return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
}
