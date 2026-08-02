"use client";

// FunnelCard — one row in the funnels list. Shows title, slug, stats strip,
// and publish/edit/delete actions. The stats layout is defined inline below;
// it used to point at a command-center StatsStrip that nothing imported.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Play, CheckCircle, Mail, ExternalLink, Pencil, Trash2, Copy, Code2, CopyPlus, BarChart3 } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";

export type FunnelSummary = {
  id: string;
  slug: string;
  type: string;
  title: string;
  published: boolean;
  view_count: number;
  start_count: number;
  complete_count: number;
  email_count: number;
  created_at: string;
  updated_at: string;
};

type Props = {
  funnel: FunnelSummary;
  onEdit: (funnel: FunnelSummary) => void;
  onDelete: (funnel: FunnelSummary) => void;
  onTogglePublish: (funnel: FunnelSummary) => void;
  onDuplicate: (funnel: FunnelSummary) => void;
};

function statLabel(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function completionRate(starts: number, completes: number): string {
  if (starts === 0) return "--";
  return `${Math.round((completes / starts) * 100)}%`;
}

export default function FunnelCard({ funnel, onEdit, onDelete, onTogglePublish, onDuplicate }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  const quizUrl = `/q/${funnel.slug}`;
  const fullUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${quizUrl}`;
  const embedUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/embed/${funnel.slug}`;

  const embedCode = `<iframe
  src="${embedUrl}"
  width="100%"
  height="700"
  frameborder="0"
  style="border: none; border-radius: 12px; max-width: 600px;"
  allow="clipboard-write"
  title="${funnel.title}"
></iframe>`;

  function handleCopyLink() {
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleCopyEmbed() {
    navigator.clipboard.writeText(embedCode).then(() => {
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2000);
    });
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="p-5">
        {/* Header row: title + badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] truncate">
              {funnel.title}
            </h3>
            <p className="text-xs text-[color:var(--text-muted)] mt-0.5 font-mono truncate">
              /q/{funnel.slug}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge tone={funnel.published ? "brand" : "muted"} size="xs" uppercase>
              {funnel.published ? "Live" : "Draft"}
            </Badge>
            <Badge tone="neutral" size="xs">
              {funnel.type}
            </Badge>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          <StatCell icon={<Eye size={14} />} label="Views" value={statLabel(funnel.view_count)} />
          <StatCell icon={<Play size={14} />} label="Starts" value={statLabel(funnel.start_count)} />
          <StatCell
            icon={<CheckCircle size={14} />}
            label="Done"
            value={`${statLabel(funnel.complete_count)} (${completionRate(funnel.start_count, funnel.complete_count)})`}
          />
          <StatCell icon={<Mail size={14} />} label="Emails" value={statLabel(funnel.email_count)} />
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--border-faint)]">
          <Button
            size="sm"
            variant={funnel.published ? "ghost" : "primary"}
            onClick={() => onTogglePublish(funnel)}
          >
            {funnel.published ? "Unpublish" : "Publish"}
          </Button>
          <Button size="sm" variant="ghost" leadingIcon={<Pencil size={14} />} onClick={() => router.push(`/funnels/${funnel.id}/edit`)}>
            Edit
          </Button>
          {funnel.published && (
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<ExternalLink size={14} />}
              onClick={() => window.open(quizUrl, "_blank")}
            >
              Preview
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<Copy size={14} />}
            onClick={handleCopyLink}
          >
            {copied ? "Copied!" : "Copy link"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<CopyPlus size={14} />}
            onClick={() => onDuplicate(funnel)}
          >
            Duplicate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            leadingIcon={<BarChart3 size={14} />}
            onClick={() => router.push(`/funnels/${funnel.id}/analytics`)}
          >
            Analytics
          </Button>
          {funnel.published && (
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Code2 size={14} />}
              onClick={() => setEmbedOpen(true)}
            >
              Embed
            </Button>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="danger" leadingIcon={<Trash2 size={14} />} onClick={() => onDelete(funnel)}>
            Delete
          </Button>
        </div>
      </div>

      {/* Embed code modal */}
      <Modal
        open={embedOpen}
        onClose={() => setEmbedOpen(false)}
        title="Embed this quiz"
        description="Paste this code into your website's HTML to embed the quiz. Works on any site — WordPress, Squarespace, Wix, custom HTML."
        size="lg"
      >
        <div className="mt-2">
          <pre className="p-4 rounded-[var(--r-md)] bg-[var(--surface-deep)] border border-[var(--border-faint)] text-xs font-mono text-[color:var(--text)] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
            {embedCode}
          </pre>
          <div className="flex items-center gap-3 mt-4">
            <Button
              onClick={handleCopyEmbed}
              leadingIcon={<Copy size={14} />}
            >
              {embedCopied ? "Copied!" : "Copy embed code"}
            </Button>
            <span className="text-xs text-[color:var(--text-muted)]">
              Direct link: <a href={quizUrl} target="_blank" rel="noopener noreferrer" className="underline">{fullUrl}</a>
            </span>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function StatCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 text-[color:var(--text-muted)]">
        {icon}
        <span className="text-[length:var(--t-eyebrow)] font-bold uppercase tracking-[var(--tracking-eyebrow)]">{label}</span>
      </div>
      <p className="text-sm font-extrabold text-[color:var(--text)] mt-0.5">{value}</p>
    </div>
  );
}
