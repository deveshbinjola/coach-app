"use client";

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { ClientResource } from "@/lib/types";

type Props = {
  coachId: string;
  roomId: string;
  resources: ClientResource[];
  onResourceAdded: (resource: ClientResource) => void;
  onError: (message: string) => void;
};

export default function ResourcesCard({ coachId, roomId, resources, onResourceAdded, onError }: Props) {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function addResource() {
    if (!title.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("cp_client_resources")
      .insert({
        coach_id: coachId,
        client_room_id: roomId,
        title: title.trim(),
        url: url.trim() || null,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      onError(error.message);
      return;
    }
    onResourceAdded(data as ClientResource);
    setTitle("");
    setUrl("");
  }

  return (
    <Card className="space-y-3">
      <h3 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">Resources</h3>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
        placeholder="Resource title"
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
        placeholder="https://..."
      />
      <Button onClick={addResource} disabled={!title.trim() || saving} leadingIcon={<Plus size={15} />} block>
        Add resource
      </Button>
      <div className="space-y-2">
        {resources.length === 0 ? (
          <p className="rounded-[var(--r-md)] bg-[var(--surface-deep)] px-3 py-3 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            No resources yet.
          </p>
        ) : (
          resources.map((resource) => (
            <a
              key={resource.id}
              href={resource.url ?? "#"}
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
  );
}
