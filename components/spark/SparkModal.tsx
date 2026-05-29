"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, Sparkles, X } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import VisualRenderer, { VisualRendererFull } from "./VisualRenderer";
import { renderElementToPng, downloadUrl } from "./render-to-png";
import { VISUAL_TYPE_META, EXPORT_SIZES, type SparkVisualData, type ExportSize } from "@/lib/spark-visual";
import { DEFAULT_BRAND_KIT, type BrandKit } from "@/lib/brand-kit";

type Props = {
  text: string;
  brandKit?: BrandKit | null;
  onClose: () => void;
};

type Status = "loading" | "ready" | "error";

export default function SparkModal({ text, brandKit, onClose }: Props) {
  const kit = brandKit ?? DEFAULT_BRAND_KIT;
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [variations, setVariations] = useState<SparkVisualData[]>([]);
  const [selected, setSelected] = useState(0);
  const [exportSize, setExportSize] = useState<ExportSize>("square");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function generate() {
      try {
        const res = await fetch("/api/spark-visual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (cancelled) return;
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Generation failed");
        setVariations(data.variations);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : "Something went wrong.");
        setStatus("error");
      }
    }
    void generate();
    return () => { cancelled = true; };
  }, [text]);

  async function handleExport() {
    const el = exportRef.current?.querySelector("#spark-visual-export") as HTMLElement | null;
    if (!el) return;
    setExporting(true);
    try {
      const size = EXPORT_SIZES[exportSize];
      const url = await renderElementToPng(el, size.w, size.h);
      const slug = (variations[selected]?.title ?? "visual").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      downloadUrl(url, `${slug}-${exportSize}.png`);
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    } catch {
      // silent
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-xl)]">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--border-faint)] bg-[var(--surface-elevated)] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-soft)]">
              <Sparkles size={16} className="text-[color:var(--brand-strong)]" />
            </div>
            <div>
              <h2 className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)]">
                Spark Visual
              </h2>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                Pick a style, download the PNG.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-faint)] text-[color:var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[color:var(--text)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {status === "loading" && <LoadingState />}
          {status === "error" && <ErrorState message={errorMsg} onClose={onClose} />}
          {status === "ready" && variations.length > 0 && (
            <div className="space-y-6">
              {/* Visual grid */}
              <div className="grid gap-4 sm:grid-cols-2">
                {variations.map((v, i) => {
                  const meta = VISUAL_TYPE_META[v.type];
                  const active = selected === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelected(i)}
                      className={`group rounded-[var(--r-lg)] border p-3 text-left transition ${
                        active
                          ? "border-[var(--brand-strong)] bg-[var(--brand-soft)] shadow-[var(--shadow-md)]"
                          : "border-[var(--border-faint)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Badge tone={active ? "brand" : "muted"} size="xs" uppercase>
                            {meta?.label ?? v.type}
                          </Badge>
                          <span className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)] truncate">
                            {v.title}
                          </span>
                        </div>
                        {active && <Check size={14} className="text-[color:var(--brand-strong)]" />}
                      </div>
                      <div className="flex justify-center">
                        <VisualRenderer visual={v} brandKit={kit} exportSize={exportSize} scale={0.28} />
                      </div>
                      <p className="mt-2 text-[length:var(--t-caption)] text-[color:var(--text-muted)] line-clamp-1">
                        {meta?.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Export controls */}
              <Card className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                      Size
                    </span>
                    {(Object.entries(EXPORT_SIZES) as [ExportSize, { label: string }][]).map(([key, val]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setExportSize(key)}
                        className={`min-h-8 rounded-[var(--r-md)] border px-3 text-[length:var(--t-caption)] font-extrabold transition ${
                          exportSize === key
                            ? "border-[var(--brand-strong)] bg-[var(--brand-soft)] text-[color:var(--text)]"
                            : "border-[var(--border-faint)] bg-[var(--surface)] text-[color:var(--text-muted)] hover:border-[var(--border-strong)]"
                        }`}
                      >
                        {val.label}
                      </button>
                    ))}
                  </div>
                  <Button
                    onClick={handleExport}
                    disabled={exporting}
                    leadingIcon={exported ? <Check size={14} /> : <Download size={14} />}
                  >
                    {exported ? "Downloaded" : exporting ? "Rendering…" : "Download PNG"}
                  </Button>
                </div>
              </Card>

              {/* Full-size hidden render target for export */}
              <div ref={exportRef} className="fixed left-[-9999px] top-[-9999px]" aria-hidden>
                <VisualRendererFull
                  visual={variations[selected]}
                  brandKit={kit}
                  exportSize={exportSize}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand-soft)] border border-[color-mix(in_srgb,var(--brand)_30%,transparent)]">
        <Sparkles size={24} className="animate-pulse text-[color:var(--brand-strong)]" />
      </div>
      <div className="text-center">
        <p className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
          Generating 4 visual options…
        </p>
        <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          Reading your text · Picking the best layout · Applying your brand · ~5 seconds
        </p>
      </div>
    </div>
  );
}

function ErrorState({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <Badge tone="danger" size="xs" uppercase>Generation failed</Badge>
      <p className="text-[color:var(--text)]">{message}</p>
      <Button variant="ghost" onClick={onClose}>Close</Button>
    </div>
  );
}
