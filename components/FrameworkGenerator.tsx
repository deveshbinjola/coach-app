"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";

type Pillar = { letter: string; title: string; description: string };

type FrameworkOption = {
  acronym: string;
  name: string;
  tagline: string;
  pillars: Pillar[];
  leadMagnetType: string;
};

type FrameworkRow = {
  id: string;
  acronym: string;
  name: string;
  tagline: string | null;
  pillars: Pillar[];
  lead_magnet_type: string | null;
  is_primary: boolean;
  created_at: string;
};

type Step = "gallery" | "describe" | "choose" | "refine";

export default function FrameworkGenerator({
  existing,
}: {
  existing: FrameworkRow[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(existing.length > 0 ? "gallery" : "describe");

  // Step 1 state
  const [transformation, setTransformation] = useState("");
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const [letterCount, setLetterCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  // Step 2 state
  const [options, setOptions] = useState<FrameworkOption[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Step 3 state
  const [editName, setEditName] = useState("");
  const [editTagline, setEditTagline] = useState("");
  const [editPillars, setEditPillars] = useState<Pillar[]>([]);
  const [editLeadMagnet, setEditLeadMagnet] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function handleGenerate() {
    setGenerating(true);
    setGenError("");
    try {
      const res = await fetch("/api/framework/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transformation, niche, audience, letterCount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.error || "Something went wrong.");
        return;
      }
      setOptions(data.frameworks);
      setSelectedIdx(null);
      setStep("choose");
    } catch {
      setGenError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function handleSelect(idx: number) {
    setSelectedIdx(idx);
    const fw = options[idx];
    setEditName(fw.name);
    setEditTagline(fw.tagline);
    setEditPillars(fw.pillars.map((p) => ({ ...p })));
    setEditLeadMagnet(fw.leadMagnetType);
  }

  function handleProceedToRefine() {
    if (selectedIdx === null) return;
    setStep("refine");
  }

  async function handleSave() {
    if (selectedIdx === null) return;
    setSaving(true);
    setSaveError("");
    try {
      const fw = options[selectedIdx];
      const res = await fetch("/api/framework/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acronym: fw.acronym,
          name: editName,
          tagline: editTagline,
          pillars: editPillars,
          sourceInput: transformation,
          leadMagnetType: editLeadMagnet,
          isPrimary: existing.length === 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || "Failed to save.");
        return;
      }
      router.refresh();
      setStep("gallery");
      // Reset form
      setTransformation("");
      setNiche("");
      setAudience("");
      setOptions([]);
      setSelectedIdx(null);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Gallery ──────────────────────────────────────────────────────────────
  if (step === "gallery") {
    return (
      <div>
        <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
          <div>
            <Badge tone="brand" size="xs" uppercase>
              Framework Generator
            </Badge>
            <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] mt-2 leading-[var(--leading-tight)]">
              Your Signature Frameworks
            </h1>
            <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mt-1 max-w-xl leading-[var(--leading-relaxed)]">
              Named methods that become your intellectual property. Each one
              powers carousels, lead magnets, and client conversations.
            </p>
          </div>
          <Button onClick={() => setStep("describe")}>+ New Framework</Button>
        </div>

        <div className="space-y-3">
          {existing.map((fw) => (
            <Card key={fw.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-display text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
                      {fw.name}
                    </span>
                    {fw.is_primary && (
                      <Badge tone="brand" size="xs">
                        Primary
                      </Badge>
                    )}
                  </div>
                  {fw.tagline && (
                    <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mb-3 leading-[var(--leading-relaxed)]">
                      {fw.tagline}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {fw.pillars.map((p, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5"
                      >
                        <span className="font-extrabold text-[color:var(--brand-strong)]">
                          {p.letter}
                        </span>
                        <span className="text-[length:var(--t-caption)] text-[color:var(--text)]">
                          {p.title}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                {fw.lead_magnet_type && (
                  <Badge tone="neutral" size="xs">
                    {fw.lead_magnet_type}
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Step 1: Describe ─────────────────────────────────────────────────────
  if (step === "describe") {
    return (
      <div>
        <button
          onClick={() => setStep(existing.length > 0 ? "gallery" : "describe")}
          className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] hover:text-[color:var(--text)] mb-4 transition"
        >
          {existing.length > 0 ? "← Back to frameworks" : ""}
        </button>

        <Badge tone="brand" size="xs" uppercase>
          Step 1 of 3 · Describe
        </Badge>
        <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] mt-2 mb-1 leading-[var(--leading-tight)]">
          Describe your transformation.
        </h1>
        <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mb-6 max-w-xl leading-[var(--leading-relaxed)]">
          Walk through the key steps or phases of how you help clients. The AI
          will extract the core pillars and coin acronym options for you.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-[length:var(--t-caption)] font-semibold text-[color:var(--text)] mb-1.5">
              Your transformation process *
            </label>
            <textarea
              value={transformation}
              onChange={(e) => setTransformation(e.target.value)}
              placeholder="I help men who are stuck in their heads reconnect with their bodies through breathwork, then we rebuild their daily structure around what actually matters, strip away the busy-work identity, build an offer that reflects who they really are, and create a rhythm of content that doesn't feel performative..."
              rows={5}
              className="w-full rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 text-[length:var(--t-body)] text-[color:var(--text)] placeholder:text-[color:var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] resize-y"
            />
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] mt-1">
              Be specific. Name the phases, the shifts, the before-and-after.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[length:var(--t-caption)] font-semibold text-[color:var(--text)] mb-1.5">
                Your niche (optional)
              </label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. Men's coaching, Executive wellness"
                className="w-full rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] placeholder:text-[color:var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </div>
            <div>
              <label className="block text-[length:var(--t-caption)] font-semibold text-[color:var(--text)] mb-1.5">
                Your audience (optional)
              </label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. Male coaches doing $5K-$20K/mo"
                className="w-full rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] placeholder:text-[color:var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[length:var(--t-caption)] font-semibold text-[color:var(--text)] mb-1.5">
              Acronym length
            </label>
            <div className="flex gap-2">
              {[3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  onClick={() => setLetterCount(n)}
                  className={`w-10 h-10 rounded-[var(--r-lg)] border font-bold text-[length:var(--t-body)] transition ${
                    letterCount === n
                      ? "border-[var(--brand-strong)] bg-[var(--brand-soft)] text-[color:var(--brand-strong)]"
                      : "border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text-muted)] hover:border-[var(--text-faint)]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {genError && (
            <p className="text-[length:var(--t-caption)] text-red-600 font-medium">
              {genError}
            </p>
          )}

          <Button
            onClick={handleGenerate}
            disabled={generating || transformation.trim().length < 20}
            className="w-full sm:w-auto"
          >
            {generating ? "Generating..." : "Generate Framework Options →"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 2: Choose ───────────────────────────────────────────────────────
  if (step === "choose") {
    return (
      <div>
        <button
          onClick={() => setStep("describe")}
          className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] hover:text-[color:var(--text)] mb-4 transition"
        >
          ← Back to description
        </button>

        <Badge tone="brand" size="xs" uppercase>
          Step 2 of 3 · Choose
        </Badge>
        <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] mt-2 mb-1 leading-[var(--leading-tight)]">
          Pick your framework.
        </h1>
        <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mb-6 max-w-xl leading-[var(--leading-relaxed)]">
          Each option is a named acronym built from your transformation. Pick
          the one that feels most like your method.
        </p>

        <div className="space-y-3 mb-6">
          {options.map((fw, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              className={`w-full text-left rounded-[var(--r-xl)] border-2 p-5 transition ${
                selectedIdx === idx
                  ? "border-[var(--brand-strong)] bg-[var(--brand-soft)]"
                  : "border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[var(--text-faint)]"
              }`}
            >
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className="font-display text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
                  {fw.name}
                </span>
                <Badge tone="neutral" size="xs">
                  {fw.leadMagnetType}
                </Badge>
              </div>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mb-3 leading-[var(--leading-relaxed)]">
                {fw.tagline}
              </p>
              <div className="flex flex-wrap gap-2">
                {fw.pillars.map((p, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1"
                  >
                    <span className="font-extrabold text-[color:var(--brand-strong)] text-[length:var(--t-body)]">
                      {p.letter}
                    </span>
                    <span className="text-[length:var(--t-caption)] text-[color:var(--text)]">
                      {p.title}
                    </span>
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => {
              setStep("describe");
            }}
            variant="ghost"
          >
            Regenerate
          </Button>
          <Button
            onClick={handleProceedToRefine}
            disabled={selectedIdx === null}
          >
            Refine This One →
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 3: Refine ───────────────────────────────────────────────────────
  if (step === "refine" && selectedIdx !== null) {
    const fw = options[selectedIdx];
    return (
      <div>
        <button
          onClick={() => setStep("choose")}
          className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] hover:text-[color:var(--text)] mb-4 transition"
        >
          ← Back to options
        </button>

        <Badge tone="brand" size="xs" uppercase>
          Step 3 of 3 · Refine
        </Badge>
        <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] mt-2 mb-1 leading-[var(--leading-tight)]">
          Make it yours.
        </h1>
        <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mb-6 max-w-xl leading-[var(--leading-relaxed)]">
          Edit the name, tagline, and pillar descriptions until it sounds like
          you. This becomes your signature IP.
        </p>

        <div className="space-y-5">
          {/* Acronym display */}
          <div className="flex items-center gap-2 mb-2">
            {fw.acronym.split("").map((letter, i) => (
              <span
                key={i}
                className="w-12 h-12 rounded-[var(--r-lg)] bg-[var(--navy,#0A0F1C)] text-[color:var(--brand-bright,#4ADE80)] font-display font-extrabold text-xl flex items-center justify-center"
              >
                {letter}
              </span>
            ))}
          </div>

          {/* Name */}
          <div>
            <label className="block text-[length:var(--t-caption)] font-semibold text-[color:var(--text)] mb-1.5">
              Framework name
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
            />
          </div>

          {/* Tagline */}
          <div>
            <label className="block text-[length:var(--t-caption)] font-semibold text-[color:var(--text)] mb-1.5">
              Tagline
            </label>
            <input
              type="text"
              value={editTagline}
              onChange={(e) => setEditTagline(e.target.value)}
              className="w-full rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
            />
          </div>

          {/* Pillars */}
          <div>
            <label className="block text-[length:var(--t-caption)] font-semibold text-[color:var(--text)] mb-2">
              Pillars
            </label>
            <div className="space-y-3">
              {editPillars.map((p, i) => (
                <div
                  key={i}
                  className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-8 h-8 rounded-md bg-[var(--brand-soft)] text-[color:var(--brand-strong)] font-extrabold text-sm flex items-center justify-center">
                      {p.letter}
                    </span>
                    <input
                      type="text"
                      value={p.title}
                      onChange={(e) => {
                        const next = [...editPillars];
                        next[i] = { ...next[i], title: e.target.value };
                        setEditPillars(next);
                      }}
                      className="flex-1 font-semibold rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                    />
                  </div>
                  <textarea
                    value={p.description}
                    onChange={(e) => {
                      const next = [...editPillars];
                      next[i] = { ...next[i], description: e.target.value };
                      setEditPillars(next);
                    }}
                    rows={2}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] resize-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Lead magnet type */}
          <div>
            <label className="block text-[length:var(--t-caption)] font-semibold text-[color:var(--text)] mb-1.5">
              Suggested lead magnet
            </label>
            <div className="flex flex-wrap gap-2">
              {["audit", "scorecard", "checklist", "playbook", "blueprint"].map(
                (type) => (
                  <button
                    key={type}
                    onClick={() => setEditLeadMagnet(type)}
                    className={`rounded-[var(--r-lg)] border px-3 py-1.5 text-[length:var(--t-caption)] font-medium capitalize transition ${
                      editLeadMagnet === type
                        ? "border-[var(--brand-strong)] bg-[var(--brand-soft)] text-[color:var(--brand-strong)]"
                        : "border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text-muted)] hover:border-[var(--text-faint)]"
                    }`}
                  >
                    {type}
                  </button>
                )
              )}
            </div>
          </div>

          {saveError && (
            <p className="text-[length:var(--t-caption)] text-red-600 font-medium">
              {saveError}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={() => setStep("choose")} variant="ghost">
              ← Back
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
            >
              {saving ? "Saving..." : "Save Framework"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
