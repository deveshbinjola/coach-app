"use client";

import type { SparkVisualData, ExportSize } from "@/lib/spark-visual";
import { EXPORT_SIZES } from "@/lib/spark-visual";
import type { BrandKit } from "@/lib/brand-kit";
import { DEFAULT_BRAND_KIT } from "@/lib/brand-kit";

type Props = {
  visual: SparkVisualData;
  brandKit: BrandKit;
  exportSize: ExportSize;
  scale?: number;
};

export default function VisualRenderer({ visual, brandKit, exportSize, scale = 0.35 }: Props) {
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
        {visual.type === "infographic" && <InfographicVisual visual={visual} kit={kit} />}
        {visual.type === "flow" && <FlowVisual visual={visual} kit={kit} />}
        {visual.type === "framework" && <FrameworkVisual visual={visual} kit={kit} />}
        {visual.type === "quote" && <QuoteVisual visual={visual} kit={kit} />}
      </div>
    </div>
  );
}

export function VisualRendererFull({
  visual,
  brandKit,
  exportSize,
}: {
  visual: SparkVisualData;
  brandKit: BrandKit;
  exportSize: ExportSize;
}) {
  const kit = brandKit ?? DEFAULT_BRAND_KIT;
  const size = EXPORT_SIZES[exportSize];

  return (
    <div id="spark-visual-export" style={{ width: size.w, height: size.h }}>
      {visual.type === "infographic" && <InfographicVisual visual={visual} kit={kit} />}
      {visual.type === "flow" && <FlowVisual visual={visual} kit={kit} />}
      {visual.type === "framework" && <FrameworkVisual visual={visual} kit={kit} />}
      {visual.type === "quote" && <QuoteVisual visual={visual} kit={kit} />}
    </div>
  );
}

function InfographicVisual({ visual, kit }: { visual: SparkVisualData; kit: BrandKit }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: kit.primaryHex,
        fontFamily: `'${kit.fontFamily}', system-ui, sans-serif`,
        display: "flex",
        flexDirection: "column",
        padding: 72,
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: kit.accentHex,
          opacity: 0.08,
        }}
      />
      <div style={{ marginBottom: 48 }}>
        <div
          style={{
            display: "inline-block",
            padding: "6px 16px",
            borderRadius: 4,
            background: kit.accentHex,
            color: kit.primaryHex,
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            marginBottom: 20,
          }}
        >
          Key insights
        </div>
        <h2
          style={{
            fontSize: 52,
            fontWeight: 800,
            lineHeight: 1.05,
            color: kit.backgroundHex,
            margin: 0,
          }}
        >
          {visual.title}
        </h2>
        {visual.subtitle && (
          <p style={{ fontSize: 22, color: kit.accentHex, marginTop: 12, opacity: 0.85 }}>
            {visual.subtitle}
          </p>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
        {visual.elements.map((el, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "20px 24px",
              borderRadius: 12,
              background: `color-mix(in srgb, ${kit.backgroundHex} 8%, transparent)`,
              borderLeft: `4px solid ${kit.accentHex}`,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: kit.accentHex,
                color: kit.primaryHex,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: kit.backgroundHex, margin: 0, lineHeight: 1.25 }}>
                {el.label}
              </p>
              {el.value && (
                <p style={{ fontSize: 16, color: kit.accentHex, margin: "4px 0 0", opacity: 0.8 }}>
                  {el.value}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowVisual({ visual, kit }: { visual: SparkVisualData; kit: BrandKit }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: kit.backgroundHex,
        fontFamily: `'${kit.fontFamily}', system-ui, sans-serif`,
        display: "flex",
        flexDirection: "column",
        padding: 72,
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      <div style={{ marginBottom: 40 }}>
        <div
          style={{
            display: "inline-block",
            padding: "6px 16px",
            borderRadius: 4,
            background: kit.primaryHex,
            color: kit.backgroundHex,
            fontSize: 14,
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            marginBottom: 20,
          }}
        >
          The process
        </div>
        <h2
          style={{
            fontSize: 48,
            fontWeight: 800,
            lineHeight: 1.05,
            color: kit.primaryHex,
            margin: 0,
          }}
        >
          {visual.title}
        </h2>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 0,
          justifyContent: "center",
          position: "relative",
        }}
      >
        {visual.elements.map((el, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 24, position: "relative" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 48 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: i === 0 ? kit.accentHex : kit.primaryHex,
                  color: i === 0 ? kit.primaryHex : kit.backgroundHex,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  fontWeight: 800,
                  position: "relative",
                  zIndex: 2,
                }}
              >
                {i + 1}
              </div>
              {i < visual.elements.length - 1 && (
                <div style={{ width: 3, flex: 1, minHeight: 24, background: `color-mix(in srgb, ${kit.primaryHex} 15%, transparent)` }} />
              )}
            </div>
            <div style={{ paddingBottom: i < visual.elements.length - 1 ? 12 : 0, paddingTop: 10, flex: 1 }}>
              <p style={{ fontSize: 24, fontWeight: 700, color: kit.primaryHex, margin: 0, lineHeight: 1.2 }}>
                {el.label}
              </p>
              {el.value && (
                <p style={{ fontSize: 16, color: kit.textHex, margin: "6px 0 0", opacity: 0.6 }}>
                  {el.value}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FrameworkVisual({ visual, kit }: { visual: SparkVisualData; kit: BrandKit }) {
  const half = Math.ceil(visual.elements.length / 2);
  const topRow = visual.elements.slice(0, half);
  const bottomRow = visual.elements.slice(half);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: `linear-gradient(135deg, ${kit.primaryHex} 0%, color-mix(in srgb, ${kit.primaryHex} 85%, ${kit.accentHex}) 100%)`,
        fontFamily: `'${kit.fontFamily}', system-ui, sans-serif`,
        display: "flex",
        flexDirection: "column",
        padding: 72,
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: -60,
          left: -60,
          width: 250,
          height: 250,
          borderRadius: "50%",
          border: `2px solid ${kit.accentHex}`,
          opacity: 0.12,
        }}
      />
      <div style={{ marginBottom: 48, textAlign: "center" as const }}>
        <div
          style={{
            display: "inline-block",
            padding: "6px 20px",
            borderRadius: 100,
            border: `2px solid ${kit.accentHex}`,
            color: kit.accentHex,
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
            marginBottom: 20,
          }}
        >
          Framework
        </div>
        <h2
          style={{
            fontSize: 52,
            fontWeight: 800,
            lineHeight: 1.05,
            color: kit.backgroundHex,
            margin: 0,
          }}
        >
          {visual.title}
        </h2>
        {visual.subtitle && (
          <p style={{ fontSize: 20, color: kit.accentHex, marginTop: 12, opacity: 0.8 }}>
            {visual.subtitle}
          </p>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
        <div style={{ display: "flex", gap: 16 }}>
          {topRow.map((el, i) => (
            <FrameworkCell key={i} el={el} kit={kit} index={i} />
          ))}
        </div>
        {bottomRow.length > 0 && (
          <div style={{ display: "flex", gap: 16 }}>
            {bottomRow.map((el, i) => (
              <FrameworkCell key={i + half} el={el} kit={kit} index={i + half} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FrameworkCell({ el, kit, index }: { el: { label: string; value?: string }; kit: BrandKit; index: number }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "28px 24px",
        borderRadius: 16,
        background: `color-mix(in srgb, ${kit.backgroundHex} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${kit.accentHex} 25%, transparent)`,
        textAlign: "center" as const,
      }}
    >
      <div
        style={{
          fontSize: 32,
          fontWeight: 800,
          color: kit.accentHex,
          marginBottom: 8,
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </div>
      <p style={{ fontSize: 20, fontWeight: 700, color: kit.backgroundHex, margin: 0, lineHeight: 1.2 }}>
        {el.label}
      </p>
      {el.value && (
        <p style={{ fontSize: 14, color: kit.accentHex, margin: "8px 0 0", opacity: 0.7 }}>
          {el.value}
        </p>
      )}
    </div>
  );
}

function QuoteVisual({ visual, kit }: { visual: SparkVisualData; kit: BrandKit }) {
  const heroQuote = visual.elements[0]?.label ?? visual.title;
  const supporting = visual.elements.slice(1);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: kit.primaryHex,
        fontFamily: `'${kit.fontFamily}', system-ui, sans-serif`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 60,
          left: 64,
          fontSize: 200,
          fontWeight: 800,
          color: kit.accentHex,
          opacity: 0.1,
          lineHeight: 1,
        }}
      >
        &ldquo;
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 6,
          height: "100%",
          background: kit.accentHex,
        }}
      />
      <div style={{ position: "relative", zIndex: 2 }}>
        <p
          style={{
            fontSize: 44,
            fontWeight: 800,
            lineHeight: 1.15,
            color: kit.backgroundHex,
            margin: 0,
            maxWidth: 850,
          }}
        >
          {heroQuote}
        </p>
        {visual.subtitle && (
          <p style={{ fontSize: 20, color: kit.accentHex, marginTop: 24, fontWeight: 600 }}>
            — {visual.subtitle}
          </p>
        )}
        {supporting.length > 0 && (
          <div
            style={{
              marginTop: 40,
              paddingTop: 28,
              borderTop: `2px solid color-mix(in srgb, ${kit.accentHex} 25%, transparent)`,
              display: "flex",
              gap: 24,
              flexWrap: "wrap" as const,
            }}
          >
            {supporting.slice(0, 3).map((el, i) => (
              <div key={i} style={{ flex: 1, minWidth: 180 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: kit.backgroundHex, margin: 0, lineHeight: 1.3 }}>
                  {el.label}
                </p>
                {el.value && (
                  <p style={{ fontSize: 13, color: kit.accentHex, margin: "4px 0 0", opacity: 0.7 }}>
                    {el.value}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
