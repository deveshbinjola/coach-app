// components/ambient/PersonPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui";
import type { PersonSignals } from "@/lib/ambient";
import { DollarSign, MessageCircle, Package, RefreshCw, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Props = {
  leadId: string | null;
  onClose: () => void;
};

export default function PersonPanel({ leadId, onClose }: Props) {
  const [signals, setSignals] = useState<PersonSignals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leadId) {
      setSignals(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/leads/${leadId}/signals`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setSignals(data as PersonSignals);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (!leadId) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/8 z-40 transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel — desktop: right slide-over, mobile: bottom sheet */}
      <div
        className={`fixed z-50 bg-[var(--surface-elevated)] shadow-[var(--shadow-md)] transition-transform duration-200 ease-out overflow-y-auto
          right-0 top-0 bottom-0 w-[320px]
          max-md:top-auto max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:w-full max-md:max-h-[70vh] max-md:rounded-t-2xl
          ${leadId ? "translate-x-0 max-md:translate-y-0" : "translate-x-full max-md:translate-y-full"}
        `}
        role="dialog"
        aria-label="Person details"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] flex items-center justify-center rounded-full hover:bg-[var(--surface-deep)] transition text-[color:var(--text-muted)]"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="p-5 pt-4">
          {loading && (
            <div className="py-12 text-center text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              Loading...
            </div>
          )}

          {error && (
            <div className="py-12 text-center text-[length:var(--t-caption)] text-[color:var(--danger)]">
              {error}
            </div>
          )}

          {signals && !loading && (
            <>
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-[length:var(--t-h2)] font-bold text-[color:var(--text)] truncate flex-1">
                  {signals.name}
                </h2>
                <Badge tone={signals.status === "client" ? "brand" : "neutral"} size="xs">
                  {signals.status === "client" ? "Client" : "Lead"}
                </Badge>
              </div>

              {/* Journey line */}
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mb-4">
                {signals.status === "client" ? "Client" : "Lead"} since{" "}
                {new Date(signals.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
                {signals.source ? ` · via ${signals.source}` : ""}
              </p>

              {/* Signal lines */}
              <div className="space-y-3">
                {signals.lastMessage && (
                  <SignalLine
                    icon={MessageCircle}
                    warning={signals.flags.messageWaiting}
                    text={`${signals.lastMessage.direction === "outbound" ? "You sent" : "They sent"} a message · ${formatDaysAgo(signals.lastMessage.date)}`}
                  />
                )}

                {signals.lastSession && (
                  <div>
                    <SignalLine
                      icon={Target}
                      warning={signals.flags.sessionOverdue}
                      text={`Last session ${formatDaysAgo(signals.lastSession.date)} · ${signals.lastSession.keyTopics.slice(0, 2).join(", ") || "no topics"}`}
                    />
                    <p className="ml-8 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                      {signals.totalSessions} session{signals.totalSessions === 1 ? "" : "s"} total
                      {signals.sessionRhythm ? ` · ${signals.sessionRhythm}` : ""}
                    </p>
                  </div>
                )}

                {signals.offering && (
                  <SignalLine
                    icon={Package}
                    text={`${signals.offering.name} · month ${signals.offering.monthsIn}${signals.offering.totalMonths ? ` of ${signals.offering.totalMonths}` : ""}`}
                  />
                )}

                {signals.sequence && (
                  <SignalLine
                    icon={RefreshCw}
                    text={`${signals.sequence.name}${signals.sequence.totalSteps > 0 ? ` · step ${signals.sequence.currentStep} of ${signals.sequence.totalSteps}` : ""}`}
                  />
                )}

                {signals.lifetimePaid > 0 && (
                  <SignalLine
                    icon={DollarSign}
                    text={`$${(signals.lifetimePaid / 100).toLocaleString()} lifetime`}
                  />
                )}
              </div>

              {/* Quick actions */}
              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-[var(--border-faint)]">
                <a
                  href={`/inbox?compose=open&ids=${leadId}`}
                  className="inline-flex items-center justify-center h-9 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--text-inverse)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition"
                >
                  Message
                </a>
                {signals.status === "client" && (
                  <a
                    href="/sessions/new"
                    className="inline-flex items-center justify-center h-9 px-4 rounded-[var(--r-md)] border border-[var(--border)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:border-[var(--border-strong)] transition"
                  >
                    Capture session
                  </a>
                )}
                <a
                  href={`/leads/${leadId}`}
                  className="ml-auto text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition"
                >
                  Full profile →
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function SignalLine({
  icon: Icon,
  text,
  warning = false,
}: {
  icon: LucideIcon;
  text: string;
  warning?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} strokeWidth={1.9} className="mt-0.5 shrink-0 text-[color:var(--text-muted)]" aria-hidden />
      <span
        className={`text-[length:var(--t-caption)] ${
          warning ? "text-[color:var(--warning)]" : "text-[color:var(--text)]"
        }`}
      >
        {text}
      </span>
    </div>
  );
}

function formatDaysAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const days = Math.round((now - d) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
