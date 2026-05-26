"use client";

// FunnelEditor — modal for editing funnel details (title, slug, CTA URLs,
// publish toggle). Opened from FunnelCard "Edit" button.

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import type { FunnelSummary } from "./FunnelCard";

type Props = {
  funnel: FunnelSummary;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: FunnelSummary) => void;
};

export default function FunnelEditor({ funnel, open, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(funnel.title);
  const [slug, setSlug] = useState(funnel.slug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/funnels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: funnel.id,
          title: title.trim(),
          slug: slug.trim().toLowerCase(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save.");
        return;
      }
      onSaved({
        ...funnel,
        title: data.funnel.title,
        slug: data.funnel.slug,
        updated_at: data.funnel.updated_at,
      });
      onClose();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Quiz" size="md">
      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1.5">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[color:var(--text)] text-sm focus:outline-none focus:border-[var(--brand)] transition"
            placeholder="Your Brand Quiz"
          />
        </div>

        {/* Slug */}
        <div>
          <label className="block text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1.5">
            URL Slug
          </label>
          <div className="flex items-center gap-0">
            <span className="shrink-0 px-3 py-2 text-xs font-mono text-[color:var(--text-muted)] bg-[var(--surface-deep)] border border-r-0 border-[var(--border)] rounded-l-[var(--r-md)]">
              /q/
            </span>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              maxLength={60}
              className="flex-1 min-w-0 px-3 py-2 rounded-r-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[color:var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--brand)] transition"
              placeholder="my-quiz-slug"
            />
          </div>
          <p className="text-[10px] text-[color:var(--text-muted)] mt-1">
            3-60 chars. Lowercase letters, numbers, hyphens only.
          </p>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-[color:var(--danger)] font-semibold">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !title.trim() || !slug.trim()}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
