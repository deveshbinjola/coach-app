"use client";

// BrandKitPanel — tenant-level brand identity for carousel rendering.
//
// Coach sets:
//   - 4 colors (primary / accent / background / text) — hex inputs + swatches
//   - Google Font family + weight (curated list of 20)
//   - Logo (uploaded to coach-brand-assets Supabase Storage bucket)
//   - Optional: "Import from image" — drops a Canva export, we extract
//     the 4 dominant colors so the coach doesn't have to type hex codes
//
// All values save to cp_coach_settings. The carousel renderer reads them
// when carousel_default_style === 'brand_kit'.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Badge, Button } from "@/components/ui";
import {
  BRAND_FONTS,
  fontFamilyStack,
  googleFontsHref,
  isValidHex,
  readableTextOn,
  DEFAULT_BRAND_KIT,
  type BrandFont,
} from "@/lib/brand-kit";

type BrandKitFormValues = {
  primary:    string;
  accent:     string;
  background: string;
  text:       string;
  fontFamily: string;
  fontWeight: string;
  logoUrl:    string | null;
};

type Props = {
  /** Initial values from cp_coach_settings. Nulls fall back to DEFAULT_BRAND_KIT. */
  initial: BrandKitFormValues;
};

export default function BrandKitPanel({ initial }: Props) {
  const supabase = createClient();
  const [values, setValues] = useState<BrandKitFormValues>(initial);
  const [committed, setCommitted] = useState<BrandKitFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [extractingColors, setExtractingColors] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(committed),
    [values, committed]
  );
  const validHex = isValidHex(values.primary) && isValidHex(values.accent) && isValidHex(values.background) && isValidHex(values.text);

  // Hot-load the chosen Google Font so the preview reflects it immediately.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const href = googleFontsHref(values.fontFamily);
    const id = "brand-kit-font-preview";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }, [values.fontFamily]);

  async function onSave() {
    if (!validHex) {
      setFlash({ kind: "err", msg: "One of the colors isn't a valid hex (#RGB or #RRGGBB)." });
      return;
    }
    setSaving(true);
    setFlash(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setFlash({ kind: "err", msg: "Signed out. Refresh and try again." });
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("cp_coach_settings")
      .update({
        brand_primary_hex:    values.primary,
        brand_accent_hex:     values.accent,
        brand_background_hex: values.background,
        brand_text_hex:       values.text,
        brand_font_family:    values.fontFamily,
        brand_font_weight:    values.fontWeight,
        brand_logo_url:       values.logoUrl,
      })
      .eq("coach_id", user.id);
    setSaving(false);
    if (error) {
      setFlash({ kind: "err", msg: error.message });
      return;
    }
    setCommitted(values);
    setFlash({ kind: "ok", msg: "Brand kit saved. New carousels use these defaults." });
  }

  async function onLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      setFlash({ kind: "err", msg: "Logo must be an image file (PNG, JPG, SVG)." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setFlash({ kind: "err", msg: "Logo must be under 2 MB." });
      return;
    }
    setUploadingLogo(true);
    setFlash(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setFlash({ kind: "err", msg: "Signed out. Refresh and try again." });
      setUploadingLogo(false);
      return;
    }
    const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
    const path = `${user.id}/logo.${ext}`;
    const { error: uploadErr } = await supabase
      .storage
      .from("coach-brand-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadErr) {
      setFlash({ kind: "err", msg: uploadErr.message });
      setUploadingLogo(false);
      return;
    }
    const { data: pub } = supabase.storage.from("coach-brand-assets").getPublicUrl(path);
    // Cache-bust so the preview updates immediately after re-upload.
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    setValues((v) => ({ ...v, logoUrl: url }));
    setUploadingLogo(false);
    setFlash({ kind: "ok", msg: "Logo uploaded. Click Save to apply." });
  }

  /** Extract the 4 dominant colors from an uploaded image. Useful when the
   *  coach has a Canva-exported brand board and doesn't want to type hex codes. */
  async function onExtractColorsFromImage(file: File) {
    setExtractingColors(true);
    setFlash(null);
    try {
      const colors = await extractDominantColors(file, 4);
      if (colors.length < 4) {
        setFlash({ kind: "err", msg: "Couldn't extract 4 distinct colors. Try a different image." });
        setExtractingColors(false);
        return;
      }
      // Heuristic order: darkest = text, lightest = background, most saturated = primary, next = accent
      const sorted = colors.slice();
      const lightest = sorted.reduce((a, b) => luminanceOf(a) > luminanceOf(b) ? a : b);
      const darkest  = sorted.reduce((a, b) => luminanceOf(a) < luminanceOf(b) ? a : b);
      const remaining = sorted.filter((c) => c !== lightest && c !== darkest);
      const primary = remaining[0] ?? colors[0];
      const accent  = remaining[1] ?? colors[1];
      setValues((v) => ({
        ...v,
        primary, accent, background: lightest, text: darkest,
      }));
      setFlash({ kind: "ok", msg: "Colors extracted. Adjust below if any feel off, then Save." });
    } catch (err) {
      setFlash({ kind: "err", msg: err instanceof Error ? err.message : "Color extraction failed." });
    }
    setExtractingColors(false);
  }

  return (
    <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-6 space-y-6">
      <div>
        <Badge tone="brand" size="xs" uppercase>Brand kit</Badge>
        <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)] mt-2">
          Your colors, your font, your logo
        </h2>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 leading-[var(--leading-relaxed)]">
          Drives every carousel when style = "Brand kit". Set once, every new draft inherits.
        </p>
      </div>

      {/* Quick-import from Canva-exported image */}
      <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)] mb-2">
          Quick start · import from image
        </p>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mb-3">
          Have a brand board exported from Canva, Figma, or anywhere? Drop it here — we'll extract the 4 dominant colors.
        </p>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] cursor-pointer hover:border-[var(--text-muted)] text-[length:var(--t-caption)] font-bold">
          {extractingColors ? "Extracting…" : "Choose image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onExtractColorsFromImage(f); }}
            disabled={extractingColors}
          />
        </label>
      </div>

      {/* Color inputs */}
      <div>
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)] mb-3">
          Colors
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <ColorField label="Primary"    value={values.primary}    onChange={(v) => setValues((s) => ({ ...s, primary: v }))} />
          <ColorField label="Accent"     value={values.accent}     onChange={(v) => setValues((s) => ({ ...s, accent: v }))} />
          <ColorField label="Background" value={values.background} onChange={(v) => setValues((s) => ({ ...s, background: v }))} />
          <ColorField label="Text"       value={values.text}       onChange={(v) => setValues((s) => ({ ...s, text: v }))} />
        </div>
      </div>

      {/* Font picker */}
      <div>
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)] mb-3">
          Font · Google Fonts
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <select
            value={values.fontFamily}
            onChange={(e) => setValues((s) => ({ ...s, fontFamily: e.target.value }))}
            className="h-11 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[color:var(--text)] focus:border-[var(--brand-strong)] focus:outline-none"
          >
            {BRAND_FONTS.map((f) => (
              <option key={f.family} value={f.family}>{f.family} — {f.preview}</option>
            ))}
          </select>
          <select
            value={values.fontWeight}
            onChange={(e) => setValues((s) => ({ ...s, fontWeight: e.target.value }))}
            className="h-11 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[color:var(--text)] focus:border-[var(--brand-strong)] focus:outline-none"
          >
            {(BRAND_FONTS.find((f) => f.family === values.fontFamily)?.weights ?? ["400","600","700","800"]).map((w) => (
              <option key={w} value={w}>{w}{weightLabel(w)}</option>
            ))}
          </select>
        </div>
        <FontPreview values={values} />
      </div>

      {/* Logo upload */}
      <div>
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)] mb-2">
          Logo
        </p>
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-[var(--r-md)] border border-[var(--border)] flex items-center justify-center overflow-hidden"
            style={{ background: values.background }}
          >
            {values.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={values.logoUrl} alt="Brand logo" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">No logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] cursor-pointer hover:border-[var(--text-muted)] text-[length:var(--t-caption)] font-bold w-fit">
              {uploadingLogo ? "Uploading…" : (values.logoUrl ? "Replace logo" : "Upload logo")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onLogoUpload(f); }}
                disabled={uploadingLogo}
              />
            </label>
            {values.logoUrl && (
              <button
                type="button"
                onClick={() => setValues((s) => ({ ...s, logoUrl: null }))}
                className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] underline decoration-dotted underline-offset-2 w-fit"
              >
                Remove logo
              </button>
            )}
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
              PNG / SVG · square works best · &lt;2 MB
            </p>
          </div>
        </div>
      </div>

      {/* Live preview — what a carousel cover slide looks like */}
      <BrandKitPreview values={values} />

      {flash && (
        <p
          className={`text-[length:var(--t-caption)] ${flash.kind === "ok" ? "text-[color:var(--success)]" : "text-[color:var(--danger)]"}`}
          role={flash.kind === "err" ? "alert" : "status"}
        >
          {flash.msg}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={!isDirty || saving || !validHex} className="h-12 px-6">
          {saving ? "Saving…" : "Save brand kit"}
        </Button>
      </div>
    </section>
  );
}

// ============================================================
// SUBCOMPONENTS
// ============================================================

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const ok = isValidHex(value);
  return (
    <div>
      <label className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text)] mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={ok ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="w-10 h-10 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] cursor-pointer"
          aria-label={`${label} swatch`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className={`flex-1 min-w-0 h-10 px-3 rounded-[var(--r-md)] border bg-[var(--surface)] text-[color:var(--text)] font-mono text-[length:var(--t-caption)] uppercase ${
            ok ? "border-[var(--border)] focus:border-[var(--brand-strong)]" : "border-[var(--danger)]"
          } focus:outline-none`}
          aria-label={`${label} hex value`}
        />
      </div>
    </div>
  );
}

function FontPreview({ values }: { values: BrandKitFormValues }) {
  return (
    <div
      className="rounded-[var(--r-md)] border border-[var(--border)] p-4 text-[color:var(--text)]"
      style={{
        background: values.background,
        color: values.text,
        fontFamily: fontFamilyStack(values.fontFamily),
        fontWeight: Number(values.fontWeight),
      }}
    >
      <div className="text-2xl leading-tight">The next 3 clients you'll sign are already in your DMs.</div>
      <div className="text-sm mt-2 opacity-75">{values.fontFamily} · weight {values.fontWeight}</div>
    </div>
  );
}

function BrandKitPreview({ values }: { values: BrandKitFormValues }) {
  return (
    <div>
      <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)] mb-2">
        Live preview · carousel cover
      </p>
      <div
        className="aspect-square w-full max-w-xs rounded-[var(--r-lg)] p-6 flex flex-col justify-between"
        style={{
          background: values.background,
          color: values.text,
          fontFamily: fontFamilyStack(values.fontFamily),
          fontWeight: Number(values.fontWeight),
        }}
      >
        <div className="flex items-center gap-2">
          {values.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={values.logoUrl} alt="" className="w-7 h-7 object-contain" />
          )}
          <span className="text-[length:var(--t-eyebrow)] font-bold uppercase tracking-[var(--tracking-eyebrow)]" style={{ color: values.primary }}>
            Your brand
          </span>
        </div>
        <div className="text-3xl leading-tight">
          Three clients are already in your DMs.
        </div>
        <div
          className="text-xs px-3 py-1.5 rounded-full inline-flex w-fit"
          style={{ background: values.accent, color: readableTextOn(values.accent) }}
        >
          Tap to read more
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HELPERS
// ============================================================

function weightLabel(w: string): string {
  const map: Record<string, string> = {
    "400": " · regular",
    "500": " · medium",
    "600": " · semibold",
    "700": " · bold",
    "800": " · extrabold",
  };
  return map[w] ?? "";
}

function luminanceOf(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Quick dominant-color extraction via canvas pixel sampling. Returns the
 *  N most-frequent colors quantized to 32 levels per channel. Not perfect,
 *  but good enough for "I exported my brand board from Canva." */
async function extractDominantColors(file: File, n: number): Promise<string[]> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read image."));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Image failed to decode."));
    i.src = dataUrl;
  });
  // Downscale to 100x100 for performance.
  const canvas = document.createElement("canvas");
  canvas.width = 100;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported in this browser.");
  ctx.drawImage(img, 0, 0, 100, 100);
  const { data } = ctx.getImageData(0, 0, 100, 100);
  const counts = new Map<string, number>();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 200) continue; // skip transparent
    // Quantize to 16-step bins per channel.
    const r = Math.round(data[i]     / 16) * 16;
    const g = Math.round(data[i + 1] / 16) * 16;
    const b = Math.round(data[i + 2] / 16) * 16;
    const key = `${r},${g},${b}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, n).map(([k]) => {
    const [r, g, b] = k.split(",").map(Number);
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  });
  return top;
}
