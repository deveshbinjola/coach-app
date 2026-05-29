"use client";

import { useRef, useState } from "react";
import { Check, Download } from "lucide-react";
import { renderElementToPng, downloadUrl } from "./render-to-png";
import { EXPORT_SIZES, type ExportSize } from "@/lib/spark-visual";
import type { BrandKit } from "@/lib/brand-kit";
import { DEFAULT_BRAND_KIT } from "@/lib/brand-kit";

type Pillar = { letter: string; title: string; description: string };

type FrameworkData = {
  acronym: string;
  name: string;
  tagline: string | null;
  pillars: Pillar[];
};

// ── Scaled preview ─────────────────────────────────────────────────────

type PreviewProps = {
  framework: FrameworkData;
  brandKit?: BrandKit | null;
  exportSize?: ExportSize;
  scale?: number;
};

export default function FrameworkDiagram({
  framework,
  brandKit,
  exportSize = "square",
  scale = 0.28,
}: PreviewProps) {
  const kit = brandKit ?? DEFAULT_BRAND_KIT;
  const size = EXPORT_SIZES[exportSize];
  const scaledW = size.w * scale;
  const scaledH = size.h * scale;

  return (
    <div
      className="overflow-hidden rounded-[var(--r-md)] shadow-[var(--shadow-sm)]"
      style={{ width: scaledW, height: scaledH }}
    >
      <div
        style={{
          width: size.w,
          height: size.h,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <AcronymStackVisual framework={framework} kit={kit} size={size} />
      </div>
    </div>
  );
}

// ── Full-size for export ───────────────────────────────────────────────

export function FrameworkDiagramFull({
  framework,
  brandKit,
  exportSize = "square",
}: {
  framework: FrameworkData;
  brandKit?: BrandKit | null;
  exportSize?: ExportSize;
}) {
  const kit = brandKit ?? DEFAULT_BRAND_KIT;
  const size = EXPORT_SIZES[exportSize];

  return (
    <div data-export-target style={{ width: size.w, height: size.h }}>
      <AcronymStackVisual framework={framework} kit={kit} size={size} />
    </div>
  );
}

// ── Self-contained export button with size picker ──────────────────────

export function FrameworkExportButton({
  framework,
  brandKit,
}: {
  framework: FrameworkData;
  brandKit?: BrandKit | null;
}) {
  const kit = brandKit ?? DEFAULT_BRAND_KIT;
  const [exportSize, setExportSize] = useState<ExportSize>("square");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  async function handleExport(size: ExportSize) {
    setExportSize(size);
    setShowSizes(false);
    // Wait for re-render with correct size
    await new Promise((r) => setTimeout(r, 60));

    const el = exportRef.current?.querySelector(
      "[data-export-target]",
    ) as HTMLElement | null;
    if (!el) return;
    setExporting(true);
    try {
      const dims = EXPORT_SIZES[size];
      const url = await renderElementToPng(el, dims.w, dims.h);
      const slug = framework.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);
      downloadUrl(url, `${slug}-${size}.png`);
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    } catch {
      // silent
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="relative" onMouseLeave={() => setShowSizes(false)}>
        <button
          type="button"
          onClick={() => setShowSizes(!showSizes)}
          disabled={exporting}
          className="flex items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-faint)] px-2.5 py-1.5 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[color:var(--text)] disabled:opacity-50"
        >
          {exported ? <Check size={13} /> : <Download size={13} />}
          <span>{exported ? "Done" : exporting ? "Rendering..." : "PNG"}</span>
        </button>
        {showSizes && (
          <div className="absolute right-0 top-full mt-1 z-30 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] py-1 min-w-[160px]">
            {(
              Object.entries(EXPORT_SIZES) as [ExportSize, { label: string }][]
            ).map(([key, val]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleExport(key)}
                className="w-full text-left px-3 py-2 text-[length:var(--t-caption)] text-[color:var(--text)] hover:bg-[var(--brand-soft)] transition"
              >
                {val.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Hidden render target */}
      <div
        ref={exportRef}
        className="fixed left-[-9999px] top-[-9999px]"
        aria-hidden
      >
        <FrameworkDiagramFull
          framework={framework}
          brandKit={kit}
          exportSize={exportSize}
        />
      </div>
    </>
  );
}

// ── Acronym stack visual ───────────────────────────────────────────────

function AcronymStackVisual({
  framework,
  kit,
  size,
}: {
  framework: FrameworkData;
  kit: BrandKit;
  size: { w: number; h: number };
}) {
  const isStory = size.h > size.w * 1.5;
  const padding = isStory ? 80 : 72;
  const letterSize = isStory ? 56 : 48;
  const titleSize = isStory ? 48 : 44;
  const pillarTitleSize = isStory ? 28 : 24;
  const pillarDescSize = isStory ? 16 : 14;
  const pillarGap = isStory ? 18 : 12;
  const headerMb = isStory ? 48 : 32;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: kit.primaryHex,
        fontFamily: `'${kit.fontFamily}', system-ui, sans-serif`,
        display: "flex",
        flexDirection: "column",
        padding,
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative circles */}
      <div
        style={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 350,
          height: 350,
          borderRadius: "50%",
          background: kit.accentHex,
          opacity: 0.06,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -80,
          left: -80,
          width: 250,
          height: 250,
          borderRadius: "50%",
          border: `2px solid ${kit.accentHex}`,
          opacity: 0.08,
        }}
      />

      {/* Header */}
      <div style={{ marginBottom: headerMb, position: "relative", zIndex: 2 }}>
        <div
          style={{
            display: "inline-block",
            padding: "6px 16px",
            borderRadius: 100,
            border: `2px solid ${kit.accentHex}`,
            color: kit.accentHex,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase" as const,
            marginBottom: 20,
          }}
        >
          Your method
        </div>
        <h2
          style={{
            fontSize: titleSize,
            fontWeight: 800,
            lineHeight: 1.05,
            color: kit.backgroundHex,
            margin: 0,
          }}
        >
          {framework.name}
        </h2>
        {framework.tagline && (
          <p
            style={{
              fontSize: 18,
              color: kit.accentHex,
              marginTop: 12,
              opacity: 0.8,
              lineHeight: 1.3,
            }}
          >
            {framework.tagline}
          </p>
        )}
      </div>

      {/* Pillar rows */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: pillarGap,
          justifyContent: "center",
          position: "relative",
          zIndex: 2,
        }}
      >
        {framework.pillars.map((p, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "14px 20px",
              borderRadius: 14,
              background: `color-mix(in srgb, ${kit.backgroundHex} 8%, transparent)`,
              borderLeft: `4px solid ${kit.accentHex}`,
            }}
          >
            {/* Letter badge */}
            <div
              style={{
                width: letterSize,
                height: letterSize,
                borderRadius: 12,
                background: kit.accentHex,
                color: kit.primaryHex,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: letterSize * 0.5,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {p.letter}
            </div>
            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: pillarTitleSize,
                  fontWeight: 700,
                  color: kit.backgroundHex,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {p.title}
              </p>
              {p.description && (
                <p
                  style={{
                    fontSize: pillarDescSize,
                    color: kit.accentHex,
                    margin: "4px 0 0",
                    opacity: 0.7,
                    lineHeight: 1.35,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {p.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer watermark */}
      <div
        style={{
          marginTop: isStory ? 36 : 20,
          textAlign: "right" as const,
          position: "relative",
          zIndex: 2,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: kit.accentHex,
            opacity: 0.4,
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
          }}
        >
          {framework.acronym} Method
        </span>
      </div>
    </div>
  );
}
