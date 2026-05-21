"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui";
import type { Lead, LeadTemperature } from "@/lib/types";

const TEMP_FILTERS: Array<{
  value: LeadTemperature;
  label: string;
  activeTone: "danger" | "warning" | "brand" | "info";
}> = [
  { value: "on_fire", label: "Hot",     activeTone: "danger" },
  { value: "hot",     label: "Warm",    activeTone: "warning" },
  { value: "warm",    label: "Warm+",   activeTone: "brand" },
  { value: "cold",    label: "Cold",    activeTone: "info" },
  { value: "dormant", label: "Dormant", activeTone: "info" },
];

type Props = {
  leads: Lead[];
  onFiltered: (filtered: Lead[]) => void;
};

export default function LeadSearchBar({ leads, onFiltered }: Props) {
  const [query, setQuery] = useState("");
  const [activeTemps, setActiveTemps] = useState<Set<LeadTemperature>>(new Set());

  const toggleTemp = useCallback((temp: LeadTemperature) => {
    setActiveTemps((prev) => {
      const next = new Set(prev);
      if (next.has(temp)) next.delete(temp);
      else next.add(temp);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let result = leads;
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (lead) =>
          lead.full_name.toLowerCase().includes(q) ||
          (lead.email ?? "").toLowerCase().includes(q) ||
          (lead.notes ?? "").toLowerCase().includes(q)
      );
    }
    if (activeTemps.size > 0) {
      result = result.filter((lead) => activeTemps.has(lead.temperature));
    }
    return result;
  }, [leads, query, activeTemps]);

  useEffect(() => {
    onFiltered(filtered);
  }, [filtered, onFiltered]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)]"
          aria-hidden
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search leads by name, email, or notes…"
          className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-9 pr-9 text-[length:var(--t-caption)] text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-faint)] focus:border-[var(--brand-strong)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--text-faint)] hover:text-[color:var(--text)]"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
          Filter
        </span>
        {TEMP_FILTERS.map((filter) => {
          const isActive = activeTemps.has(filter.value);
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => toggleTemp(filter.value)}
              className="transition"
            >
              <Badge
                tone={isActive ? filter.activeTone : "neutral"}
                size="xs"
                uppercase
              >
                {filter.label}
              </Badge>
            </button>
          );
        })}
        {(query || activeTemps.size > 0) && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveTemps(new Set());
            }}
            className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition"
          >
            Clear all
          </button>
        )}
        <span className="ml-auto text-[length:var(--t-caption)] text-[color:var(--text-muted)] tabular-nums">
          {filtered.length} lead{filtered.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
