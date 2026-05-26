"use client";

// FunnelsWorkspace — the full funnels management page.
//
// Three states:
//   1. Empty + no Brand OS  -> "Complete Brand OS first" CTA
//   2. Empty + has Brand OS -> "Generate your first quiz" hero
//   3. Has funnels          -> List with stats + generate more button
//
// Generate calls /api/funnels/generate, which reads the coach's latest
// Brand OS synthesis and produces a 5-question Resonance Quiz via Claude.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Plus, BarChart3, Sparkles } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import FunnelCard, { type FunnelSummary } from "./FunnelCard";
import FunnelEditor from "./FunnelEditor";
import type { FunnelRow } from "@/app/funnels/page";

type Props = {
  funnels: FunnelRow[];
  hasBrandOs: boolean;
};

export default function FunnelsWorkspace({ funnels: initialFunnels, hasBrandOs }: Props) {
  const router = useRouter();
  const [funnels, setFunnels] = useState<FunnelSummary[]>(initialFunnels);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  // Edit modal
  const [editTarget, setEditTarget] = useState<FunnelSummary | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<FunnelSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Generate ──────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setGenError("");
    try {
      const res = await fetch("/api/funnels/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error || "Failed to generate quiz.");
        return;
      }
      // Prepend the new funnel to the list
      const newFunnel: FunnelSummary = {
        id: data.funnel.id,
        slug: data.funnel.slug,
        type: "resonance",
        title: data.funnel.title,
        published: data.funnel.published ?? false,
        view_count: 0,
        start_count: 0,
        complete_count: 0,
        email_count: 0,
        created_at: data.funnel.created_at,
        updated_at: data.funnel.created_at,
      };
      setFunnels((prev) => [newFunnel, ...prev]);
    } catch {
      setGenError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, []);

  // ── Toggle publish ────────────────────────────────────────

  async function handleTogglePublish(funnel: FunnelSummary) {
    const newPublished = !funnel.published;
    try {
      const res = await fetch("/api/funnels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: funnel.id, published: newPublished }),
      });
      if (!res.ok) return;
      setFunnels((prev) =>
        prev.map((f) =>
          f.id === funnel.id ? { ...f, published: newPublished } : f
        )
      );
    } catch {}
  }

  // ── Delete ────────────────────────────────────────────────

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/funnels?id=${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setFunnels((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      }
    } catch {}
    setDeleting(false);
    setDeleteTarget(null);
  }

  // ── Edit saved ────────────────────────────────────────────

  function handleEditSaved(updated: FunnelSummary) {
    setFunnels((prev) =>
      prev.map((f) => (f.id === updated.id ? updated : f))
    );
  }

  // ── Render ────────────────────────────────────────────────

  // No Brand OS yet
  if (!hasBrandOs && funnels.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--surface-deep)] mb-5">
          <Sparkles size={28} className="text-[color:var(--text-muted)]" />
        </div>
        <h1 className="text-[length:var(--t-h1)] font-extrabold text-[color:var(--text)]">
          Quiz Funnels
        </h1>
        <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mt-2 max-w-md mx-auto">
          Generate a quiz funnel from your Brand OS. Complete Brand OS first to unlock quiz generation.
        </p>
        <Button
          className="mt-6"
          onClick={() => router.push("/brand-os")}
          leadingIcon={<Zap size={16} />}
        >
          Complete Brand OS
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[length:var(--t-h1)] font-extrabold text-[color:var(--text)]">
            Quiz Funnels
          </h1>
          <p className="text-sm text-[color:var(--text-muted)] mt-0.5">
            Generate quizzes from your Brand OS. Share the link. Capture leads.
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generating || !hasBrandOs}
          leadingIcon={generating ? <Spinner /> : <Plus size={16} />}
        >
          {generating ? "Generating..." : "New Quiz"}
        </Button>
      </div>

      {/* Error banner */}
      {genError && (
        <div className="mb-4 p-3 rounded-[var(--r-md)] bg-[var(--danger-soft)] text-[color:var(--danger)] text-sm font-semibold">
          {genError}
        </div>
      )}

      {/* Empty state with Brand OS */}
      {funnels.length === 0 && hasBrandOs && (
        <Card padding="lg" className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--brand-soft)] mb-4">
            <BarChart3 size={24} className="text-[color:var(--brand-strong)]" />
          </div>
          <h2 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">
            Ready to generate your first quiz
          </h2>
          <p className="text-sm text-[color:var(--text-muted)] mt-2 max-w-sm mx-auto">
            We'll turn your Brand OS pillars into a 5-question Resonance Quiz that segments visitors into archetypes and captures emails.
          </p>
          <Button
            className="mt-5"
            onClick={handleGenerate}
            disabled={generating}
            leadingIcon={generating ? <Spinner /> : <Sparkles size={16} />}
          >
            {generating ? "Generating quiz..." : "Generate Resonance Quiz"}
          </Button>
          {genError && (
            <p className="text-sm text-[color:var(--danger)] mt-3 font-semibold">{genError}</p>
          )}
        </Card>
      )}

      {/* Funnel list */}
      {funnels.length > 0 && (
        <div className="space-y-4">
          {funnels.map((funnel) => (
            <FunnelCard
              key={funnel.id}
              funnel={funnel}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
              onTogglePublish={handleTogglePublish}
            />
          ))}
        </div>
      )}

      {/* Aggregate stats bar (when there are funnels) */}
      {funnels.length > 0 && (
        <div className="mt-6 p-4 rounded-[var(--r-lg)] bg-[var(--surface-deep)] border border-[var(--border-faint)]">
          <div className="flex items-center gap-6 justify-center text-sm">
            <span className="text-[color:var(--text-muted)]">
              Total views: <strong className="text-[color:var(--text)]">{funnels.reduce((s, f) => s + f.view_count, 0).toLocaleString()}</strong>
            </span>
            <span className="text-[color:var(--text-muted)]">
              Total completions: <strong className="text-[color:var(--text)]">{funnels.reduce((s, f) => s + f.complete_count, 0).toLocaleString()}</strong>
            </span>
            <span className="text-[color:var(--text-muted)]">
              Emails captured: <strong className="text-[color:var(--text)]">{funnels.reduce((s, f) => s + f.email_count, 0).toLocaleString()}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <FunnelEditor
          funnel={editTarget}
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleEditSaved}
        />
      )}

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete this quiz?"
        description={`"${deleteTarget?.title}" and all its responses will be permanently removed. This can't be undone.`}
      >
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirmDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete quiz"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

// Tiny inline spinner for the generate button
function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
