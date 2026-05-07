"use client";

// VoiceLeadsPanel, speak/type/screenshot -> AI parses -> preview -> batch save.
//
// Three states:
//   1. Empty: big textarea + "Parse with AI" button.
//   2. Parsing: spinner.
//   3. Preview: editable cards for each parsed lead + Save All / Discard.
//
// On Save: batch insert into cp_leads. Each lead is auto_draft_eligible by
// default (it's a "live" capture, not a bulk import) so the Auto-Response
// Engine fires per row via the /leads/new pattern. We invoke
// auto-draft-response per inserted lead, fire-and-forget.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import {
  PAIN_SIGNAL_LABEL,
  PAIN_SIGNALS,
  TEMPERATURE_LABEL,
  LEAD_TEMPERATURES,
  type LeadSource,
  type LeadTemperature,
  type PainSignal,
} from "@/lib/types";

type ParsedLead = {
  full_name: string;
  email: string | null;
  phone: string | null;
  source: LeadSource;
  source_detail: string | null;
  temperature: LeadTemperature;
  pain_signal: PainSignal[];
  notes: string;
  next_honest_action: string | null;
};

const SOURCES: LeadSource[] = [
  "ig",
  "linkedin",
  "referral",
  "quiz",
  "in_person",
  "podcast",
  "newsletter",
  "other",
];

type InputMode = "text" | "image";

export default function VoiceLeadsPanel() {
  const router = useRouter();
  const supabase = createClient();

  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [transcript, setTranscript] = useState("");
  // Image mode state - file kept for size display, base64 sent over the wire,
  // preview URL for the inline thumbnail.
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [leads, setLeads] = useState<ParsedLead[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Read a File into base64 + an object URL for preview. Anthropic vision
  // wants base64 without the data:image/...;base64, prefix.
  function loadImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result = "data:image/png;base64,iVBOR..."
      const comma = result.indexOf(",");
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      setImageBase64(base64);
      setImagePreview(result);
    };
    reader.onerror = () => setError("Could not read that image.");
    reader.readAsDataURL(file);
    setImageFile(file);
  }

  function clearImage() {
    setImageFile(null);
    setImageBase64(null);
    setImagePreview(null);
  }

  async function parse() {
    setError(null);
    setLeads(null);
    setSavedCount(null);

    // Validate by mode.
    if (inputMode === "text" && transcript.trim().length < 10) {
      setError("Add at least a sentence about who you're capturing.");
      return;
    }
    if (inputMode === "image" && (!imageBase64 || !imageFile)) {
      setError("Drop a screenshot first.");
      return;
    }

    setParsing(true);
    try {
      // Branch payload by mode. Edge Function accepts either shape.
      const requestBody =
        inputMode === "image"
          ? {
              image_base64: imageBase64!,
              mime_type: imageFile!.type || "image/png",
            }
          : { transcript };

      const { data, error: invokeErr } = await supabase.functions.invoke(
        "voice-leads-parse",
        { body: requestBody }
      );
      if (invokeErr) {
        setError(invokeErr.message);
        return;
      }
      const r = data as { leads?: ParsedLead[]; error?: string };
      if (r.error) {
        setError(r.error);
        return;
      }
      // Sanitize/normalize the LLM output so the form components don't blow
      // up if the model returns slightly off-spec data.
      const cleaned: ParsedLead[] = (r.leads ?? []).map((l) => ({
        full_name: (l.full_name ?? "").trim() || "Unnamed lead",
        email: (l.email ?? "")?.trim() || null,
        phone: (l.phone ?? "")?.trim() || null,
        source: SOURCES.includes(l.source) ? l.source : "other",
        source_detail: (l.source_detail ?? "")?.trim() || null,
        temperature: LEAD_TEMPERATURES.includes(l.temperature)
          ? l.temperature
          : "warm",
        pain_signal: Array.isArray(l.pain_signal)
          ? l.pain_signal.filter((p): p is PainSignal =>
              PAIN_SIGNALS.includes(p as PainSignal)
            )
          : [],
        notes: (l.notes ?? "").trim() || "",
        next_honest_action: l.next_honest_action ?? null,
      }));
      if (cleaned.length === 0) {
        setError("No leads detected. Try rephrasing or adding more context.");
        return;
      }
      setLeads(cleaned);
    } catch (err) {
      setError(String(err));
    } finally {
      setParsing(false);
    }
  }

  function updateLead(idx: number, patch: Partial<ParsedLead>) {
    if (!leads) return;
    setLeads(leads.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function removeLead(idx: number) {
    if (!leads) return;
    setLeads(leads.filter((_, i) => i !== idx));
  }

  function togglePain(idx: number, p: PainSignal) {
    if (!leads) return;
    const lead = leads[idx];
    const has = lead.pain_signal.includes(p);
    updateLead(idx, {
      pain_signal: has
        ? lead.pain_signal.filter((x) => x !== p)
        : [...lead.pain_signal, p],
    });
  }

  async function saveAll() {
    if (!leads || leads.length === 0) return;
    setError(null);
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated. Sign in again.");
        return;
      }

      // Build the insert payload. Live capture -> auto_draft_eligible=true so
      // the Auto-Response Engine fires per lead.
      const rows = leads.map((l) => ({
        coach_id: user.id,
        full_name: l.full_name,
        email: l.email,
        phone: l.phone,
        source: l.source,
        source_detail: l.source_detail,
        temperature: l.temperature,
        pain_signal: l.pain_signal,
        notes: l.notes || null,
        status: "new" as const,
        auto_draft_eligible: true,
      }));

      const { data: inserted, error: insErr } = await supabase
        .from("cp_leads")
        .insert(rows)
      .select("id");
      if (insErr) {
        setError(insErr.message);
        return;
      }

      // Fire auto-draft per inserted lead, fire-and-forget. Drafts will
      // appear in the lead thread shortly if the coach opens one directly.
      for (const row of inserted ?? []) {
        supabase.functions
          .invoke("auto-draft-response", { body: { lead_id: row.id } })
          .catch(() => {
            /* non-fatal - coach can re-trigger manually */
          });
      }

      const ids = (inserted ?? []).map((row) => row.id);
      setSavedIds(ids);
      setSavedCount(ids.length);
      setTimeout(() => {
        const query = ids.length
          ? `?compose=open&source=start-here&ids=${encodeURIComponent(ids.join(","))}`
          : "";
        router.push(`/inbox${query}`);
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  // ---------- render ----------

  if (savedCount !== null) {
    return (
      <div className="card p-8 text-center border-2 border-[#00FF41] bg-[#F0FFF4]">
        <div className="text-4xl mb-2">✓</div>
        <h2 className="text-xl font-extrabold">
          {savedCount} {savedCount === 1 ? "lead" : "leads"} saved.
        </h2>
        <p className="text-sm text-gray-600 mt-2">
          Opening Compose with these leads selected. Draft the next honest
          message while the context is fresh.
        </p>
        {savedIds.length > 0 && (
          <a
            href={`/inbox?compose=open&source=start-here&ids=${encodeURIComponent(savedIds.join(","))}`}
            className="inline-flex items-center justify-center mt-5 h-10 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition"
          >
            Open Compose now
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* INPUT STATE - two modes, same downstream pipeline */}
      {!leads && (
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-6">
          {/* Mode switcher - Speak/Type vs Drop a screenshot */}
          <div
            role="tablist"
            aria-label="Input mode"
            className="inline-flex rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] overflow-hidden text-[length:var(--t-caption)] mb-5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === "text"}
              onClick={() => setInputMode("text")}
              className={`px-4 h-10 font-bold transition ${
                inputMode === "text"
                  ? "bg-[var(--brand-soft)] text-[color:var(--text)]"
                  : "text-[color:var(--text-muted)] hover:bg-[var(--surface-deep)] hover:text-[color:var(--text)]"
              }`}
            >
              Speak or type
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inputMode === "image"}
              onClick={() => setInputMode("image")}
              className={`px-4 h-10 font-bold border-l border-[var(--border)] transition ${
                inputMode === "image"
                  ? "bg-[var(--brand-soft)] text-[color:var(--text)]"
                  : "text-[color:var(--text-muted)] hover:bg-[var(--surface-deep)] hover:text-[color:var(--text)]"
              }`}
            >
              Drop a screenshot
            </button>
          </div>

          {/* TEXT MODE */}
          {inputMode === "text" && (
            <>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mb-3 leading-[var(--leading-relaxed)]">
                Dictate (Wispr Flow, Mac dictation, phone keyboard mic) or type.
                Mention who, where they came from, what they want, any context
                you remember. We&apos;ll parse each person into a structured record.
              </p>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={10}
                placeholder={`Three new leads. Maria Garcia came in through the IG quiz, talked about heartbreak, no email yet, hot lead. Then John Smith was referred by Steve from the men's circle, asked about embodiment work, john at example dot com. And that guy I met at the AMLT retreat, Tom Riley, looking for purpose coaching, definitely qualified, follow up Tuesday.`}
                className="w-full p-4 rounded-[var(--r-md)] border border-[var(--border)] text-[length:var(--t-body)] font-medium leading-[var(--leading-relaxed)] bg-[var(--surface-elevated)] focus:outline-none focus:border-[var(--brand-strong)]"
              />
              <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
                <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                  {transcript.length} characters
                </div>
                <button
                  type="button"
                  onClick={parse}
                  disabled={parsing || transcript.trim().length < 10}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] font-bold text-[length:var(--t-caption)] hover:bg-[var(--brand-strong)] transition disabled:opacity-50"
                >
                  {parsing ? (
                    <>
                      <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse" />
                      Parsing...
                    </>
                  ) : (
                    "Parse with AI"
                  )}
                </button>
              </div>
            </>
          )}

          {/* IMAGE MODE - drop-zone + preview */}
          {inputMode === "image" && (
            <>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mb-3 leading-[var(--leading-relaxed)]">
                Drop a screenshot of an Instagram inbox, email thread, Calendly
                bookings, Apple Notes list - anywhere lead info lives. AI reads
                the image and extracts each person into a structured record.
              </p>

              {!imagePreview ? (
                <ScreenshotDropZone
                  onFile={(f) => {
                    setError(null);
                    if (!f.type.startsWith("image/")) {
                      setError("That's not an image. Try a PNG, JPG, or WebP.");
                      return;
                    }
                    if (f.size > 5 * 1024 * 1024) {
                      setError(`Image too large (${(f.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.`);
                      return;
                    }
                    loadImage(f);
                  }}
                />
              ) : (
                <div className="rounded-[var(--r-md)] border border-[var(--border)] overflow-hidden bg-[var(--surface)]">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--surface-deep)] border-b border-[var(--border)] text-[length:var(--t-caption)]">
                    <span className="text-[color:var(--text-muted)] truncate">
                      <strong className="text-[color:var(--text)]">{imageFile?.name ?? "screenshot"}</strong>
                      <span className="ml-2">{imageFile ? `${(imageFile.size / 1024).toFixed(0)}KB` : ""}</span>
                    </span>
                    <button
                      type="button"
                      onClick={clearImage}
                      className="font-bold text-[color:var(--text-muted)] hover:text-[#B42318] transition"
                    >
                      Remove
                    </button>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="Lead source screenshot"
                    className="w-full max-h-[480px] object-contain bg-[var(--surface)]"
                  />
                </div>
              )}

              <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
                <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                  {imageFile
                    ? `Ready · ${imageFile.type.split("/")[1].toUpperCase()}`
                    : "PNG, JPG, WebP, or GIF · max 5MB"}
                </div>
                <button
                  type="button"
                  onClick={parse}
                  disabled={parsing || !imageBase64}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] font-bold text-[length:var(--t-caption)] hover:bg-[var(--brand-strong)] transition disabled:opacity-50"
                >
                  {parsing ? (
                    <>
                      <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse" />
                      Reading screenshot...
                    </>
                  ) : (
                    "Extract leads"
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* PREVIEW STATE */}
      {leads && (
        <>
          <div className="card p-5 bg-[#F0FFF4] border-2 border-[#00FF41]">
            <div className="text-[10px] uppercase tracking-widest font-extrabold text-[#00CC34]">
              ✨ {leads.length} {leads.length === 1 ? "lead" : "leads"} parsed
            </div>
            <p className="text-sm text-gray-700 mt-1">
              Review and edit each one. Save All when ready - auto-drafts fire
              per lead. Discard to start over.
            </p>
          </div>

          <div className="space-y-3">
            {leads.map((lead, i) => (
              <LeadCard
                key={i}
                lead={lead}
                index={i}
                total={leads.length}
                onUpdate={(patch) => updateLead(i, patch)}
                onRemove={() => removeLead(i)}
                onTogglePain={(p) => togglePain(i, p)}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={saveAll}
              disabled={saving || leads.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#00FF41] text-[#0A0F1C] font-extrabold text-sm hover:bg-[#00E03A] transition disabled:opacity-50"
            >
              {saving
                ? "Saving..."
                : `✓ Save all ${leads.length} ${leads.length === 1 ? "lead" : "leads"}`}
            </button>
            <button
              type="button"
              onClick={() => {
                setLeads(null);
                setError(null);
              }}
              disabled={saving}
              className="text-xs font-semibold text-gray-700 hover:text-[#0A0F1C] underline decoration-dotted underline-offset-4 disabled:opacity-50"
            >
              Discard and try again
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="card p-4 border-red-300 bg-red-50">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}

// ---------- editable lead card ----------

function LeadCard({
  lead,
  index,
  total,
  onUpdate,
  onRemove,
  onTogglePain,
}: {
  lead: ParsedLead;
  index: number;
  total: number;
  onUpdate: (patch: Partial<ParsedLead>) => void;
  onRemove: () => void;
  onTogglePain: (p: PainSignal) => void;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider bg-[#0A0F1C] text-[#00FF41] px-2 py-0.5 rounded">
            #{index + 1} of {total}
          </span>
          <input
            type="text"
            value={lead.full_name}
            onChange={(e) => onUpdate({ full_name: e.target.value })}
            placeholder="Full name"
            className="font-bold text-base bg-transparent border-b border-gray-200 focus:outline-none focus:border-[#00FF41] px-1 py-0.5 min-w-[200px]"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs font-semibold text-gray-500 hover:text-red-700 transition"
          aria-label={`Remove ${lead.full_name}`}
        >
          Remove
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
            Email
          </label>
          <input
            type="email"
            value={lead.email ?? ""}
            onChange={(e) => onUpdate({ email: e.target.value || null })}
            placeholder="optional"
            className="w-full p-2 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#00FF41]"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
            Source
          </label>
          <select
            value={lead.source}
            onChange={(e) => onUpdate({ source: e.target.value as LeadSource })}
            className="w-full p-2 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#00FF41] font-medium"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
            Source detail
          </label>
          <input
            type="text"
            value={lead.source_detail ?? ""}
            onChange={(e) =>
              onUpdate({ source_detail: e.target.value || null })
            }
            placeholder="e.g. AMLT retreat, IG quiz"
            className="w-full p-2 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#00FF41]"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
            Warmth
          </label>
          <select
            value={lead.temperature}
            onChange={(e) =>
              onUpdate({ temperature: e.target.value as LeadTemperature })
            }
            className="w-full p-2 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#00FF41] font-medium"
          >
            {LEAD_TEMPERATURES.map((t) => (
              <option key={t} value={t}>
                {TEMPERATURE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">
          Pain signals (click to toggle)
        </label>
        <div className="flex flex-wrap gap-1.5">
          {PAIN_SIGNALS.map((p) => {
            const active = lead.pain_signal.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => onTogglePain(p)}
                className={`text-[11px] px-2 py-1 rounded border font-semibold transition ${
                  active
                    ? "bg-amber-100 text-amber-900 border-amber-300"
                    : "bg-white text-gray-500 border-gray-200 hover:border-amber-300 hover:text-amber-800"
                }`}
              >
                {active && "✓ "}
                {PAIN_SIGNAL_LABEL[p]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
          Notes
        </label>
        <textarea
          value={lead.notes}
          onChange={(e) => onUpdate({ notes: e.target.value })}
          rows={2}
          className="w-full p-2 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#00FF41] leading-relaxed"
        />
      </div>
    </div>
  );
}

// ---------- screenshot drop-zone ----------
//
// Drag-and-drop OR click-to-pick. Single-file, image-only. Validation lives
// in the parent's `onFile` handler so the zone stays presentational.
//
// Paste support: when the user copies a screenshot (Cmd+Shift+4 on Mac fills
// the clipboard) and paste-focuses the zone, we read the first image item.
// This is the fastest capture path on Mac - screenshot -> paste -> parse.

function ScreenshotDropZone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((it) => it.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (file) {
      e.preventDefault();
      onFile(file);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onPaste={onPaste}
      className={`flex flex-col items-center justify-center text-center px-6 py-10 rounded-[var(--r-md)] border-2 border-dashed transition cursor-pointer ${
        dragging
          ? "border-[var(--brand-strong)] bg-[var(--brand-soft)]"
          : "border-[var(--border)] bg-[var(--surface-deep)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)]"
      }`}
      aria-label="Drop or pick a screenshot"
    >
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-[color:var(--text-muted)] mb-3"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
        />
      </svg>
      <div className="text-[length:var(--t-body)] font-bold text-[color:var(--text)] mb-1">
        Drop a screenshot here
      </div>
      <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
        or click to pick · or paste with ⌘V
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // Reset so re-picking the same file fires onChange again.
          e.target.value = "";
        }}
      />
    </div>
  );
}
