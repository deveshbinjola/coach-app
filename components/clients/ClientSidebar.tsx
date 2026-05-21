"use client";

import { Search } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { PAIN_SIGNAL_LABEL, type ClientRoom, type ClientTask, type Lead } from "@/lib/types";

type Props = {
  leads: Lead[];
  rooms: Map<string, ClientRoom>;
  tasks: ClientTask[];
  selectedLeadId: string;
  onSelectLead: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
};

export default function ClientSidebar({
  leads,
  rooms,
  tasks,
  selectedLeadId,
  onSelectLead,
  search,
  onSearchChange,
}: Props) {
  const filtered = leads.filter(
    (lead) => !search.trim() || lead.full_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="border-b border-[var(--border-faint)] px-4 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">Clients</h2>
            <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              People who crossed from lead to client.
            </p>
          </div>
          <a
            href="/inbox"
            className="shrink-0 inline-flex items-center h-8 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:border-[var(--brand)] transition"
          >
            + Add client
          </a>
        </div>
        {leads.length > 4 && (
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)]" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search clients…"
              className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-[length:var(--t-caption)] text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-faint)] focus:border-[var(--brand-strong)]"
            />
          </div>
        )}
      </div>
      <div className="divide-y divide-[var(--border-faint)]">
        {filtered.map((lead) => {
          const room = rooms.get(lead.id);
          const active = selectedLeadId === lead.id;
          const openTaskCount = room
            ? tasks.filter((t) => t.client_room_id === room.id && t.status === "open").length
            : 0;
          return (
            <button
              key={lead.id}
              type="button"
              onClick={() => onSelectLead(lead.id)}
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
  );
}
