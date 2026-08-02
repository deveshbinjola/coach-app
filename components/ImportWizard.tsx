"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  LEAD_NEXT_ACTIONS,
  LEAD_TEMPERATURES,
  PAIN_SIGNALS,
  type LeadNextAction,
  type LeadSource,
  type LeadStatus,
  type LeadTemperature,
  type PainSignal,
} from "@/lib/types";
import { CheckCircle2, Upload } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────
// Fields on cp_leads that a coach can map from their import source.
// full_name is required; everything else is optional.
// ─────────────────────────────────────────────────────────────────────────
const TARGET_FIELDS = [
  { key: "full_name", label: "Full Name", required: true },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "source", label: "Source", required: false },
  { key: "status", label: "Status", required: false },
  { key: "temperature", label: "Warmth", required: false },
  { key: "notes", label: "Notes", required: false },
  { key: "tags", label: "Tags (comma-separated)", required: false },
  { key: "next_honest_action", label: "Next Honest Action", required: false },
  { key: "pain_signal", label: "Pain Signal (comma-separated)", required: false },
  { key: "discovery_call_completed", label: "Discovery Call Completed (y/n)", required: false },
] as const;

type TargetKey = (typeof TARGET_FIELDS)[number]["key"];

const VALID_SOURCES: LeadSource[] = ["ig", "linkedin", "referral", "quiz", "in_person", "podcast", "newsletter", "other"];
const VALID_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "booked", "client", "closed_lost"];
const VALID_TEMPS: LeadTemperature[] = LEAD_TEMPERATURES;
const VALID_ACTIONS: LeadNextAction[] = LEAD_NEXT_ACTIONS;
const VALID_PAINS: PainSignal[] = PAIN_SIGNALS;

type Row = Record<string, string>;
type Mapping = Partial<Record<TargetKey, string>>; // target field → source column name

type Step = "upload" | "map" | "review" | "done";

type FieldDiag = {
  field: "source" | "status" | "temperature" | "next_honest_action" | "pain_signal";
  label: string;
  column: string;
  matched: number;   // non-empty cells that mapped to a known enum value
  unmatched: number; // non-empty cells that fell through to the default
  empty: number;     // empty cells (not counted as unmatched)
  unmatchedSamples: string[]; // up to ~8 distinct raw values for the user to eyeball
  distribution: Record<string, number>; // coerced value → count
};

// ─────────────────────────────────────────────────────────────────────────
// Smart-guess a default mapping based on column name heuristics.
// ─────────────────────────────────────────────────────────────────────────
function autoMap(columns: string[]): Mapping {
  const m: Mapping = {};
  const lower = (s: string) => s.toLowerCase().replace(/[_\s-]/g, "");
  for (const c of columns) {
    const l = lower(c);
    // Name
    if (!m.full_name && (l === "name" || l === "fullname" || l === "contactname" || l.includes("fullname"))) m.full_name = c;
    if (!m.full_name && l === "firstname") m.full_name = c; // fallback
    // Email
    if (!m.email && l.includes("email")) m.email = c;
    // Phone
    if (!m.phone && (l.includes("phone") || l.includes("mobile") || l.includes("cell"))) m.phone = c;
    // Source / channel
    if (!m.source && (l === "source" || l === "channel" || l === "leadsource" || l.includes("source"))) m.source = c;
    // Status / stage / pipeline
    if (!m.status && (l === "status" || l === "stage" || l === "pipeline" || l === "leadstatus" || l.includes("status"))) m.status = c;
    // Temperature / warmth / heat / priority — this is the one that used to
    // silently fall back to "warm" for all values, so we cast a wider net.
    if (
      !m.temperature &&
      (
        l === "temperature" || l === "temp" || l === "warmth" ||
        l === "leadtemp" || l === "leadheat" || l === "hotness" ||
        l === "priority" || l === "warmthlevel" || l === "leadtemperature" ||
        l.includes("warmth") || l.includes("hotness") ||
        (l.includes("temp") && !l.includes("template")) ||
        (l.includes("heat") && !l.includes("theater"))
      )
    ) m.temperature = c;
    // Notes
    if (!m.notes && (l === "notes" || l === "note" || l === "remarks" || l.includes("comment"))) m.notes = c;
    // Tags
    if (!m.tags && (l === "tags" || l === "tag" || l === "labels")) m.tags = c;
    // Next honest action
    if (!m.next_honest_action && (l === "nexthonestaction" || l === "nextaction" || l === "action" || l === "nextstep")) m.next_honest_action = c;
    // Pain signal
    if (!m.pain_signal && (l === "painsignal" || l === "pain" || l === "pains" || l === "painpoint" || l === "painpoints")) m.pain_signal = c;
    // Discovery call
    if (!m.discovery_call_completed && (l === "discoverycallcompleted" || l === "discoverycall" || l === "discoverycompleted" || l === "dc")) m.discovery_call_completed = c;
  }
  return m;
}

// ─────────────────────────────────────────────────────────────────────────
// Transform a Google Sheets share URL into a CSV export URL.
// Handles both /edit and /view URLs and /d/{id}/...
// ─────────────────────────────────────────────────────────────────────────
function gsheetToCsvUrl(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const id = m[1];
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : "0";
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Coerce string values to valid enum values.
//
// Each coercer returns { value, matched } so the UI can surface unmatched
// values in the Review step instead of silently defaulting them. The bug
// that motivated this: a CSV with "🔥 On fire", "Hot lead", "5/5" etc. all
// fell through to "warm" because the old matcher required an exact slug.
// ─────────────────────────────────────────────────────────────────────────

type Coerced<T> = { value: T; matched: boolean };

// Strip emoji and normalize whitespace/dashes so labels like "🔥 On fire"
// and "on-fire" both collapse to "on fire" before keyword matching.
function normalize(v: string): string {
  return (v ?? "")
    // Remove most emoji / pictographs / variation selectors.
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[_\-\/]+/g, " ")
    .replace(/\s+/g, " ");
}

function coerceSource(v: string): Coerced<LeadSource> {
  const lc = normalize(v).replace(/\s+/g, "_");
  if ((VALID_SOURCES as readonly string[]).includes(lc)) {
    return { value: lc as LeadSource, matched: true };
  }
  // Common synonyms
  const syn: Record<string, LeadSource> = {
    instagram: "ig",
    insta: "ig",
    ig_dm: "ig",
    li: "linkedin",
    ref: "referral",
    word_of_mouth: "referral",
    wom: "referral",
    landing: "quiz",
    landing_page: "quiz",
    form: "quiz",
    event: "in_person",
    meetup: "in_person",
    conference: "in_person",
  };
  if (syn[lc]) return { value: syn[lc], matched: true };
  return { value: "other", matched: v.trim() === "" };
}

function coerceStatus(v: string): Coerced<LeadStatus> {
  const lc = normalize(v).replace(/\s+/g, "_");
  if ((VALID_STATUSES as readonly string[]).includes(lc)) {
    return { value: lc as LeadStatus, matched: true };
  }
  const syn: Record<string, LeadStatus> = {
    lead: "new",
    open: "new",
    reached_out: "contacted",
    in_convo: "contacted",
    in_conversation: "contacted",
    talking: "contacted",
    engaged: "contacted",
    call_booked: "booked",
    call_scheduled: "booked",
    scheduled: "booked",
    customer: "client",
    paying: "client",
    won: "client",
    lost: "closed_lost",
    dead: "closed_lost",
    ghosted: "closed_lost",
  };
  if (syn[lc]) return { value: syn[lc], matched: true };
  return { value: "new", matched: v.trim() === "" };
}

function coerceTemp(v: string): Coerced<LeadTemperature> {
  const raw = v.trim();
  if (!raw) return { value: "warm", matched: true }; // empty cell = fall back silently
  const n = normalize(v);
  const slug = n.replace(/\s+/g, "_");

  // Exact slug match
  if ((VALID_TEMPS as readonly string[]).includes(slug)) {
    return { value: slug as LeadTemperature, matched: true };
  }

  // Keyword containment — handles "🔥 On fire", "very hot", "warm lead",
  // "cold outreach", "dormant for 3mo", etc.
  if (/\bon fire\b|\bfire\b|\bred hot\b/.test(n)) return { value: "on_fire", matched: true };
  if (/\bhot\b/.test(n)) return { value: "hot", matched: true };
  if (/\bwarm\b|\bengaged\b|\binterested\b/.test(n)) return { value: "warm", matched: true };
  if (/\bcold\b|\bnew\b|\bunqualified\b/.test(n)) return { value: "cold", matched: true };
  if (/\bdormant\b|\bdead\b|\bcold storage\b|\bstale\b/.test(n)) return { value: "dormant", matched: true };

  // Numeric / ordinal scales (1–5 or low/med/high)
  const num = parseFloat(n);
  if (!isNaN(num)) {
    if (num >= 5) return { value: "on_fire", matched: true };
    if (num >= 4) return { value: "hot", matched: true };
    if (num >= 3) return { value: "warm", matched: true };
    if (num >= 2) return { value: "cold", matched: true };
    if (num >= 0) return { value: "dormant", matched: true };
  }
  if (/\bhigh\b|\btop\b/.test(n)) return { value: "hot", matched: true };
  if (/\bmed(ium)?\b|\bmid\b/.test(n)) return { value: "warm", matched: true };
  if (/\blow\b/.test(n)) return { value: "cold", matched: true };

  // Give up — default to warm but flag as unmatched so Review step can warn.
  return { value: "warm", matched: false };
}

function coerceAction(v: string): Coerced<LeadNextAction | null> {
  const raw = v.trim();
  if (!raw) return { value: null, matched: true };
  const lc = normalize(v).replace(/\s+/g, "_");
  if ((VALID_ACTIONS as readonly string[]).includes(lc)) {
    return { value: lc as LeadNextAction, matched: true };
  }
  const syn: Record<string, LeadNextAction> = {
    call: "invite_to_call",
    book_call: "invite_to_call",
    invite: "invite_to_call",
    followup: "follow_up_soft",
    follow_up: "follow_up_soft",
    nudge: "follow_up_soft",
    resource: "send_resource",
    share: "send_resource",
    waiting: "waiting_on_them",
    pending: "waiting_on_them",
    on_hold: "hold",
    pause: "hold",
    close: "close_loop",
    closed: "close_loop",
  };
  if (syn[lc]) return { value: syn[lc], matched: true };
  return { value: null, matched: false };
}

function coercePain(v: string): Coerced<PainSignal[]> {
  if (!v || !v.trim()) return { value: [], matched: true };
  const parts = v.split(",").map((p) => normalize(p).replace(/\s+/g, "_")).filter(Boolean);
  const valid: PainSignal[] = [];
  let anyUnmatched = false;
  for (const p of parts) {
    if ((VALID_PAINS as readonly string[]).includes(p)) {
      valid.push(p as PainSignal);
    } else {
      // Synonym keywords
      if (/heart.?break|breakup|divorce/.test(p)) valid.push("heartbreak");
      else if (/relationship|marriage|partner|conflict/.test(p)) valid.push("relationship_conflict");
      else if (/purpose|meaning|direction|lost/.test(p)) valid.push("purpose_confusion");
      else if (/numb|disconnect|shut.?down/.test(p)) valid.push("emotional_numbness");
      else if (/masculin|identity|man/.test(p)) valid.push("masculinity_identity");
      else if (/business|money|revenue|income/.test(p)) valid.push("business_pressure");
      else if (/burnout|exhaust|tired|depleted/.test(p)) valid.push("burnout");
      else anyUnmatched = true;
    }
  }
  return { value: Array.from(new Set(valid)), matched: !anyUnmatched };
}

function coerceBool(v: string): boolean {
  const lc = (v ?? "").trim().toLowerCase();
  return ["y", "yes", "true", "1", "done", "completed", "✓", "x", "complete"].includes(lc);
}

// ─────────────────────────────────────────────────────────────────────────
// PDF → rows, via pdfjs-dist. Handles two common shapes:
//   1. Tabular PDFs (e.g. an exported CRM report). First line's tokens split
//      on 2+ spaces or tabs become column headers; subsequent lines are rows.
//   2. Non-tabular PDFs (profile sheets, meeting notes, lead briefs). One
//      row per page — first non-empty line becomes "Name", the rest "Notes".
// The coach maps either shape like any other source in the next step.
// ─────────────────────────────────────────────────────────────────────────
async function parsePdf(file: File): Promise<{ rows: Row[]; columns: string[]; mode: "table" | "page" }> {
  // Dynamic import keeps pdfjs out of the SSR bundle.
  const pdfjsLib: any = await import("pdfjs-dist");
  // Point the worker at unpkg so we don't have to ship the worker file ourselves.
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pageTexts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as any[];

    // Group text items by Y coordinate (rounded) to reconstruct lines.
    const byY: Record<number, any[]> = {};
    for (const it of items) {
      if (!it.str) continue;
      const y = Math.round(it.transform[5]);
      (byY[y] ||= []).push(it);
    }
    // PDF Y is bottom-up — sort descending so top-of-page comes first.
    const sortedYs = Object.keys(byY).map(Number).sort((a, b) => b - a);
    const lines: string[] = [];
    for (const y of sortedYs) {
      const row = byY[y].sort((a, b) => a.transform[4] - b.transform[4]);
      // Use 2+ spaces between items that were far apart on the page — this
      // preserves column boundaries for tabular detection below.
      let prevX: number | null = null;
      let line = "";
      for (const it of row) {
        const x = it.transform[4];
        if (prevX !== null) {
          const gap = x - prevX;
          line += gap > 20 ? "   " : " ";
        }
        line += it.str;
        prevX = x + (it.width ?? 0);
      }
      const trimmed = line.replace(/\s+$/, "").replace(/^\s+/, "");
      if (trimmed) lines.push(trimmed);
    }
    pageTexts.push(lines.join("\n"));
  }

  // ─ Shape 1: tabular detection ─
  // If the first page's first line splits into ≥2 tokens on 2+ spaces / tabs
  // AND at least 3 following lines split into the same count, treat as table.
  const allLines = pageTexts.join("\n").split("\n").filter(Boolean);
  const splitTab = (s: string) => s.split(/\s{2,}|\t/).map((x) => x.trim()).filter(Boolean);
  if (allLines.length >= 4) {
    const headers = splitTab(allLines[0]);
    if (headers.length >= 2) {
      const matchingRows = allLines.slice(1).filter((l) => {
        const c = splitTab(l);
        return c.length >= Math.max(2, headers.length - 1);
      });
      if (matchingRows.length >= 3) {
        const rows: Row[] = matchingRows.map((l) => {
          const cells = splitTab(l);
          const r: Row = {};
          headers.forEach((h, idx) => { r[h] = (cells[idx] ?? "").trim(); });
          return r;
        });
        return { rows, columns: headers, mode: "table" };
      }
    }
  }

  // ─ Shape 2: one row per page ─
  const rows: Row[] = pageTexts
    .map((p) => {
      const lines = p.split("\n").map((s) => s.trim()).filter(Boolean);
      if (lines.length === 0) return null;
      const name = lines[0];
      const notes = lines.slice(1).join("\n");
      return { Name: name, Notes: notes } as Row;
    })
    .filter((r): r is Row => r !== null);
  return { rows, columns: ["Name", "Notes"], mode: "page" };
}

export default function ImportWizard({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [sourceLabel, setSourceLabel] = useState<string>(""); // "leads.csv" or "Google Sheet"
  const [gsheetUrl, setGsheetUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inserted, setInserted] = useState(0);
  const [skipped, setSkipped] = useState(0);

  // ─── file upload handlers ──────────────────────────────────────────────
  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    setSourceLabel(file.name);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".csv") || file.type === "text/csv") {
        const text = await file.text();
        const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
        ingest(parsed.data, parsed.meta.fields ?? []);
      } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const firstSheet = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheet];
        const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false });
        const cols = json.length > 0 ? Object.keys(json[0]) : [];
        ingest(json, cols);
      } else if (lower.endsWith(".pdf") || file.type === "application/pdf") {
        const { rows: pdfRows, columns: pdfCols, mode } = await parsePdf(file);
        if (pdfRows.length === 0) {
          setError("Couldn't extract any text from that PDF. Is it a scanned image? Those need OCR first.");
          return;
        }
        setSourceLabel(
          mode === "table"
            ? `${file.name} (PDF — detected as table, ${pdfRows.length} rows)`
            : `${file.name} (PDF — ${pdfRows.length} pages as rows, map first line to Name and rest to Notes)`
        );
        ingest(pdfRows, pdfCols);
      } else {
        setError("Unsupported file. Use .csv, .xlsx, .xls, or .pdf.");
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to parse file");
    } finally {
      setLoading(false);
    }
  }

  async function handleGsheet() {
    setError(null);
    const csvUrl = gsheetToCsvUrl(gsheetUrl.trim());
    if (!csvUrl) {
      setError("That doesn't look like a Google Sheets URL. Paste the full share link.");
      return;
    }
    setLoading(true);
    setSourceLabel("Google Sheet");
    try {
      // Proxy through our server route so CORS never blocks the fetch.
      const proxied = `/api/gsheet?url=${encodeURIComponent(csvUrl)}`;
      const res = await fetch(proxied);
      if (!res.ok) {
        if (res.status === 403) {
          setError("Sheet is private. Share it as 'Anyone with the link can view' and try again.");
        } else {
          setError(`Couldn't fetch the sheet (HTTP ${res.status}). Check the URL and sharing.`);
        }
        return;
      }
      const text = await res.text();
      const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true });
      ingest(parsed.data, parsed.meta.fields ?? []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load Google Sheet");
    } finally {
      setLoading(false);
    }
  }

  function ingest(data: Row[], cols: string[]) {
    if (data.length === 0) {
      setError("No rows found in the file.");
      return;
    }
    setRows(data);
    setColumns(cols);
    setMapping(autoMap(cols));
    setStep("map");
  }

  // ─── validation + insertion ────────────────────────────────────────────
  const previewRows = useMemo(() => rows.slice(0, 10), [rows]);

  const validation = useMemo(() => {
    if (!mapping.full_name) return { ok: false, msg: "Map a column to Full Name before continuing." };
    let missingName = 0;
    for (const r of rows) {
      const name = r[mapping.full_name]?.trim();
      if (!name) missingName++;
    }
    return { ok: true, missingName };
  }, [rows, mapping]);

  // Per-enum-column match stats. Lets the coach see that a Temperature column
  // they mapped has 27 unrecognized values that will default to "warm" BEFORE
  // they commit. Motivated by the bug where every lead came in as "warm".
  const diagnostics = useMemo<FieldDiag[]>(() => {
    const mk = (
      field: FieldDiag["field"],
      label: string,
      col: string | undefined,
      coerce: (v: string) => { matched: boolean; value: unknown },
    ): FieldDiag | null => {
      if (!col) return null;
      let matched = 0;
      let unmatched = 0;
      let empty = 0;
      const samples = new Set<string>();
      const distribution: Record<string, number> = {};
      for (const r of rows) {
        const raw = (r[col] ?? "").trim();
        if (!raw) { empty++; continue; }
        const res = coerce(raw);
        if (res.matched) {
          matched++;
          const key = Array.isArray(res.value)
            ? (res.value.length === 0 ? "(none)" : (res.value as string[]).join(","))
            : String(res.value ?? "(null)");
          distribution[key] = (distribution[key] ?? 0) + 1;
        } else {
          unmatched++;
          if (samples.size < 8) samples.add(raw);
        }
      }
      return { field, label, column: col, matched, unmatched, empty, unmatchedSamples: [...samples], distribution };
    };
    const out: FieldDiag[] = [];
    const s = mk("source", "Source", mapping.source, coerceSource);
    if (s) out.push(s);
    const st = mk("status", "Status", mapping.status, coerceStatus);
    if (st) out.push(st);
    const t = mk("temperature", "Warmth", mapping.temperature, coerceTemp);
    if (t) out.push(t);
    const a = mk("next_honest_action", "Next Action", mapping.next_honest_action, coerceAction);
    if (a) out.push(a);
    const p = mk("pain_signal", "Pain Signal", mapping.pain_signal, coercePain);
    if (p) out.push(p);
    return out;
  }, [rows, mapping]);

  async function doImport() {
    if (!mapping.full_name) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated. Sign in again.");
        setLoading(false);
        return;
      }

      // Build insert payload — one row per source row with a full_name.
      const seenEmails = new Set<string>();
      const payload: any[] = [];
      let skippedLocal = 0;

      for (const r of rows) {
        const full_name = (r[mapping.full_name!] ?? "").trim();
        if (!full_name) { skippedLocal++; continue; }

        const email = mapping.email ? ((r[mapping.email] ?? "").trim() || null) : null;
        if (email) {
          const key = email.toLowerCase();
          if (seenEmails.has(key)) { skippedLocal++; continue; }
          seenEmails.add(key);
        }

        const phone = mapping.phone ? ((r[mapping.phone] ?? "").trim() || null) : null;
        const notes = mapping.notes ? ((r[mapping.notes] ?? "").trim() || null) : null;
        const rawTags = mapping.tags ? (r[mapping.tags] ?? "").trim() : "";
        const tags = rawTags ? rawTags.split(",").map((t) => t.trim()).filter(Boolean) : [];
        const source = mapping.source
          ? coerceSource(r[mapping.source] ?? "").value
          : ("other" as LeadSource);
        const status = mapping.status
          ? coerceStatus(r[mapping.status] ?? "").value
          : ("new" as LeadStatus);
        const temperature = mapping.temperature
          ? coerceTemp(r[mapping.temperature] ?? "").value
          : ("warm" as LeadTemperature);
        const next_honest_action = mapping.next_honest_action
          ? coerceAction(r[mapping.next_honest_action] ?? "").value
          : null;
        const pain_signal = mapping.pain_signal
          ? coercePain(r[mapping.pain_signal] ?? "").value
          : ([] as PainSignal[]);
        const discovery_call_completed = mapping.discovery_call_completed
          ? coerceBool(r[mapping.discovery_call_completed] ?? "")
          : false;

        payload.push({
          coach_id: user.id,
          full_name,
          email,
          phone,
          source,
          status,
          temperature,
          notes,
          tags,
          next_honest_action,
          pain_signal,
          discovery_call_completed,
          // Phase 7: bulk imports must NOT trigger auto-response. A 500-row
          // CSV would otherwise fire 500 Anthropic calls and 500 emails.
          // The Auto-Response Engine is for "live" sources (form, webhook,
          // email sync, manual single-add) — not historical backfills.
          auto_draft_eligible: false,
        });
      }

      if (payload.length === 0) {
        setError("No rows with a Full Name to import.");
        setLoading(false);
        return;
      }

      // Insert in batches of 500 to stay well under any API limits.
      const BATCH = 500;
      let insertedLocal = 0;
      for (let i = 0; i < payload.length; i += BATCH) {
        const batch = payload.slice(i, i + BATCH);
        const { error: insertErr } = await supabase.from("cp_leads").insert(batch);
        if (insertErr) {
          setError(`Inserted ${insertedLocal} rows, then hit: ${insertErr.message}`);
          setInserted(insertedLocal);
          setSkipped(skippedLocal);
          setStep("done");
          setLoading(false);
          return;
        }
        insertedLocal += batch.length;
      }

      setInserted(insertedLocal);
      setSkipped(skippedLocal);
      setStep("done");
    } catch (e: any) {
      setError(e.message ?? "Import failed");
    } finally {
      setLoading(false);
    }
  }

  // ─── render per step ───────────────────────────────────────────────────
  return (
    <div className={embedded ? "" : "max-w-3xl mx-auto p-6"}>
      {!embedded && (
        <>
          <a href="/inbox" className="text-sm text-[color:var(--text-muted)] hover:underline">Back to Inbox</a>
          <h1 className="text-2xl font-extrabold mt-2 mb-1">Import Leads</h1>
          <p className="text-sm text-[color:var(--text-muted)] mb-6">
            CSV, Excel, PDF, or a public Google Sheet. All columns are mappable.
          </p>
        </>
      )}

      <StepBar step={step} />

      {error && (
        <div className="mb-4 p-3 rounded-[var(--r-md)] bg-[var(--danger-soft)] border border-[var(--danger-border)] text-sm text-[color:var(--danger)]">
          {error}
        </div>
      )}

      {step === "upload" && (
        <UploadStep
          onFile={handleFile}
          gsheetUrl={gsheetUrl}
          setGsheetUrl={setGsheetUrl}
          onGsheet={handleGsheet}
          loading={loading}
        />
      )}

      {step === "map" && (
        <MapStep
          columns={columns}
          mapping={mapping}
          setMapping={setMapping}
          previewRows={previewRows}
          totalRows={rows.length}
          sourceLabel={sourceLabel}
          validation={validation}
          diagnostics={diagnostics}
          onBack={() => setStep("upload")}
          onNext={() => setStep("review")}
        />
      )}

      {step === "review" && (
        <ReviewStep
          rows={rows}
          mapping={mapping}
          validation={validation}
          diagnostics={diagnostics}
          onBack={() => setStep("map")}
          onConfirm={doImport}
          loading={loading}
        />
      )}

      {step === "done" && (
        <DoneStep inserted={inserted} skipped={skipped} onViewInbox={() => router.push("/inbox")} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────
function StepBar({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map columns" },
    { key: "review", label: "Review" },
    { key: "done", label: "Done" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-2 mb-6 text-xs font-semibold uppercase">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center ${
              i <= currentIdx ? "bg-brand text-navy" : "bg-[var(--border)] text-[color:var(--text-faint)]"
            }`}
          >
            {i + 1}
          </div>
          <span className={i <= currentIdx ? "text-navy" : "text-[color:var(--text-faint)]"}>{s.label}</span>
          {i < steps.length - 1 && <span className="text-[color:var(--text-faint)]">→</span>}
        </div>
      ))}
    </div>
  );
}

function UploadStep({
  onFile,
  gsheetUrl,
  setGsheetUrl,
  onGsheet,
  loading,
}: {
  onFile: (f: File) => void;
  gsheetUrl: string;
  setGsheetUrl: (s: string) => void;
  onGsheet: () => void;
  loading: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={`card p-10 text-center border-2 border-dashed ${
          dragOver ? "border-brand bg-[var(--success-soft)]" : "border-[var(--border)]"
        }`}
      >
        <Upload size={34} strokeWidth={1.6} className="mx-auto mb-2 text-[color:var(--text-faint)]" aria-hidden />
        <h2 className="text-lg font-bold mb-1">Drop a CSV, Excel, or PDF</h2>
        <p className="text-sm text-[color:var(--text-muted)] mb-4">
          .csv, .xlsx, .xls, or <strong>.pdf</strong> (tables auto-detected; profile sheets become one row per page)
        </p>
        <label className="btn-primary inline-block cursor-pointer">
          {loading ? "Loading..." : "Choose File"}
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.pdf,text/csv,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
            disabled={loading}
          />
        </label>
      </div>

      <div className="text-center text-sm text-[color:var(--text-faint)]">— or —</div>

      <div className="card p-6">
        <h3 className="font-bold mb-1">Import from Google Sheets</h3>
        <p className="text-sm text-[color:var(--text-muted)] mb-3">
          In your sheet: <strong>Share → General access → Anyone with the link → Viewer</strong>. Then paste the URL below.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={gsheetUrl}
            onChange={(e) => setGsheetUrl(e.target.value)}
            className="flex-1 p-2 border border-[var(--border)] rounded-[var(--r-md)] text-sm"
          />
          <button onClick={onGsheet} disabled={loading || !gsheetUrl.trim()} className="btn-primary">
            {loading ? "Loading..." : "Load Sheet"}
          </button>
        </div>
        <p className="text-xs text-[color:var(--text-faint)] mt-2">
          Reads the first tab. The sheet must be public-readable for now. Private sheets (OAuth) coming later.
        </p>
      </div>
    </div>
  );
}

function MapStep({
  columns,
  mapping,
  setMapping,
  previewRows,
  totalRows,
  sourceLabel,
  validation,
  diagnostics,
  onBack,
  onNext,
}: {
  columns: string[];
  mapping: Mapping;
  setMapping: (m: Mapping) => void;
  previewRows: Row[];
  totalRows: number;
  sourceLabel: string;
  validation: { ok: boolean; msg?: string; missingName?: number };
  diagnostics: FieldDiag[];
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="card p-4 text-sm">
        <strong>{sourceLabel}</strong> — {totalRows} rows, {columns.length} columns
      </div>

      <div className="card p-6">
        <h3 className="font-bold mb-4">Map your columns to lead fields</h3>
        <div className="space-y-3">
          {TARGET_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-3">
              <label className="w-56 text-sm font-semibold">
                {f.label}
                {f.required && <span className="text-[color:var(--danger)]"> *</span>}
              </label>
              <select
                value={mapping[f.key] ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setMapping({ ...mapping, [f.key]: v || undefined });
                }}
                className="flex-1 p-2 border border-[var(--border)] rounded-[var(--r-md)] text-sm"
              >
                <option value="">— Skip —</option>
                {columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6 overflow-x-auto">
        <h3 className="font-bold mb-3">Preview (first {previewRows.length} rows)</h3>
        <table className="text-xs w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {columns.map((c) => (
                <th key={c} className="text-left p-2 font-semibold">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((r, i) => (
              <tr key={i} className="border-b border-[var(--border-faint)]">
                {columns.map((c) => (
                  <td key={c} className="p-2 text-[color:var(--text-muted)] truncate max-w-[200px]">{r[c]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!validation.ok && (
        <div className="p-3 rounded-[var(--r-md)] bg-[var(--warning-soft)] border border-[var(--warning-border)] text-sm text-[color:var(--warning)]">
          {validation.msg}
        </div>
      )}
      {validation.ok && (validation.missingName ?? 0) > 0 && (
        <div className="p-3 rounded-[var(--r-md)] bg-[var(--warning-soft)] border border-[var(--warning-border)] text-sm text-[color:var(--warning)]">
          Heads up — {validation.missingName} rows have no Full Name. They'll be skipped.
        </div>
      )}

      {diagnostics.length > 0 && <DiagnosticsPanel diagnostics={diagnostics} />}

      <div className="flex justify-between">
        <button onClick={onBack} className="btn-ghost">← Back</button>
        <button onClick={onNext} disabled={!validation.ok} className="btn-primary">
          Review →
        </button>
      </div>
    </div>
  );
}

function ReviewStep({
  rows,
  mapping,
  validation,
  diagnostics,
  onBack,
  onConfirm,
  loading,
}: {
  rows: Row[];
  mapping: Mapping;
  validation: { ok: boolean; missingName?: number };
  diagnostics: FieldDiag[];
  onBack: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  const willImport = rows.length - (validation.missingName ?? 0);
  const mapped = Object.entries(mapping).filter(([, v]) => v).length;
  const totalUnmatched = diagnostics.reduce((sum, d) => sum + d.unmatched, 0);
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h3 className="font-bold mb-3">Ready to import</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <dt className="text-[color:var(--text-muted)]">Total rows in source</dt>
          <dd className="font-semibold">{rows.length}</dd>
          <dt className="text-[color:var(--text-muted)]">Rows to import</dt>
          <dd className="font-semibold text-navy">{willImport}</dd>
          <dt className="text-[color:var(--text-muted)]">Rows skipped (no name)</dt>
          <dd className="font-semibold text-[color:var(--warning)]">{validation.missingName ?? 0}</dd>
          <dt className="text-[color:var(--text-muted)]">Fields mapped</dt>
          <dd className="font-semibold">{mapped} / {TARGET_FIELDS.length}</dd>
        </dl>
        <p className="text-xs text-[color:var(--text-faint)] mt-4">
          Duplicates (same email within this file) will be skipped. Leads default to status <code>new</code>,
          source <code>other</code>, temperature <code>warm</code> unless mapped.
        </p>
      </div>

      {diagnostics.length > 0 && <DiagnosticsPanel diagnostics={diagnostics} compact />}

      {totalUnmatched > 0 && (
        <div className="p-3 rounded-[var(--r-md)] bg-[var(--warning-soft)] border border-[var(--warning-border)] text-sm text-[color:var(--warning)]">
          <strong>{totalUnmatched} values</strong> didn't match a known enum and will fall back to their default.
          Scroll up to see which column — if these should all be a specific value, go back and remap the column or clean up the source file.
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} disabled={loading} className="btn-ghost">← Back</button>
        <button onClick={onConfirm} disabled={loading} className="btn-primary">
          {loading ? "Importing..." : `Import ${willImport} leads`}
        </button>
      </div>
    </div>
  );
}

// Diagnostics panel — shows for each enum column the matched/unmatched counts,
// the coerced value distribution, and up to ~8 unmatched sample values so the
// coach can see "oh, 'Super Hot' and '9/10' will both default to warm" BEFORE
// committing the import. Motivated by a bug where every lead imported as warm.
function DiagnosticsPanel({ diagnostics, compact = false }: { diagnostics: FieldDiag[]; compact?: boolean }) {
  return (
    <div className="card p-6">
      <h3 className="font-bold mb-1">How your values will coerce</h3>
      <p className="text-xs text-[color:var(--text-faint)] mb-4">
        Each column is mapped to a fixed set of enum values. Anything that doesn't match falls back to the default.
      </p>
      <div className="space-y-4">
        {diagnostics.map((d) => {
          const distEntries = Object.entries(d.distribution).sort((a, b) => b[1] - a[1]);
          const hasUnmatched = d.unmatched > 0;
          return (
            <div key={d.field} className={`rounded-[var(--r-md)] border p-3 ${hasUnmatched ? "border-[var(--warning-border)] bg-[var(--warning-soft)]" : "border-[var(--border)]"}`}>
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <span className="font-semibold">{d.label}</span>
                  <span className="text-[color:var(--text-faint)] text-xs ml-2">(from column “{d.column}”)</span>
                </div>
                <div className="text-xs">
                  <span className="text-[color:var(--success)] font-semibold">{d.matched} matched</span>
                  {hasUnmatched && <span className="text-[color:var(--warning)] font-semibold ml-3">{d.unmatched} unmatched</span>}
                  {d.empty > 0 && <span className="text-[color:var(--text-faint)] ml-3">{d.empty} empty</span>}
                </div>
              </div>
              {distEntries.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {distEntries.map(([val, count]) => (
                    <span key={val} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--surface-elevated)] border border-[var(--border)]">
                      <code className="font-semibold">{val}</code>
                      <span className="text-[color:var(--text-faint)]">× {count}</span>
                    </span>
                  ))}
                </div>
              )}
              {hasUnmatched && !compact && (
                <div className="text-xs text-[color:var(--warning)] mt-2">
                  <span className="font-semibold">Unmatched samples:</span>{" "}
                  {d.unmatchedSamples.map((s, i) => (
                    <span key={i} className="inline-block px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] border border-[var(--warning-border)] mr-1 mb-1">
                      <code>{s || "(empty)"}</code>
                    </span>
                  ))}
                  <div className="mt-1 text-[color:var(--text-muted)]">
                    These will default to the fallback for {d.label.toLowerCase()}. Go back and remap, or clean up the source file.
                  </div>
                </div>
              )}
              {hasUnmatched && compact && (
                <div className="text-xs text-[color:var(--warning)] mt-1">
                  {d.unmatched} values unmatched — e.g. {d.unmatchedSamples.slice(0, 3).map((s) => `"${s}"`).join(", ")}
                  {d.unmatchedSamples.length > 3 ? "..." : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DoneStep({
  inserted,
  skipped,
  onViewInbox,
}: {
  inserted: number;
  skipped: number;
  onViewInbox: () => void;
}) {
  return (
    <div className="card p-10 text-center">
      <CheckCircle2 size={44} strokeWidth={1.6} className="mx-auto mb-3 text-[color:var(--success)]" aria-hidden />
      <h2 className="text-xl font-extrabold mb-2">Imported {inserted} leads</h2>
      {skipped > 0 && <p className="text-sm text-[color:var(--text-muted)] mb-4">{skipped} rows skipped (missing name or duplicate email).</p>}
      <button onClick={onViewInbox} className="btn-primary">Go to Inbox →</button>
    </div>
  );
}
