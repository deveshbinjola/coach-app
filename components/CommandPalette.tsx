"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Home,
  Inbox,
  Users,
  Mic,
  PenTool,
  Settings,
  MessageSquarePlus,
} from "lucide-react";

type PaletteItem = {
  id: string;
  label: string;
  href: string;
  icon: typeof Home;
  keywords: string;
  section: "navigate" | "action";
};

const ITEMS: PaletteItem[] = [
  { id: "home",     label: "Home",        href: "/command-center",         icon: Home,              keywords: "dashboard command center",   section: "navigate" },
  { id: "leads",    label: "Leads",       href: "/inbox",                  icon: Inbox,             keywords: "inbox pipeline prospects",   section: "navigate" },
  { id: "clients",  label: "Clients",     href: "/clients",                icon: Users,             keywords: "customers active",           section: "navigate" },
  { id: "voice",    label: "Voice",       href: "/voice",                  icon: Mic,               keywords: "profile brand tone",         section: "navigate" },
  { id: "content",  label: "Content",     href: "/content",                icon: PenTool,           keywords: "posts drafts scheduled",     section: "navigate" },
  { id: "settings", label: "Settings",    href: "/settings",               icon: Settings,          keywords: "account preferences config", section: "navigate" },
  { id: "new-msg",  label: "New Message", href: "/inbox?compose=open",     icon: MessageSquarePlus, keywords: "compose draft write send",   section: "action"   },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? ITEMS.filter((item) => {
        const q = query.toLowerCase();
        return (
          item.label.toLowerCase().includes(q) ||
          item.keywords.toLowerCase().includes(q)
        );
      })
    : ITEMS;

  const navigate = useCallback(
    (item: PaletteItem) => {
      setOpen(false);
      setQuery("");
      router.push(item.href);
    },
    [router]
  );

  // Cmd+K / Ctrl+K to open, Escape to close
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset active index on filter change
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Keyboard navigation inside the palette
  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[activeIndex]) {
      e.preventDefault();
      navigate(filtered[activeIndex]);
    }
  }

  if (!open) return null;

  const navigateItems = filtered.filter((i) => i.section === "navigate");
  const actionItems = filtered.filter((i) => i.section === "action");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={() => { setOpen(false); setQuery(""); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[var(--border-faint)] px-4 py-3">
          <Search size={16} className="shrink-0 text-[color:var(--text-faint)]" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent text-[length:var(--t-body)] text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-faint)]"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-[var(--r-sm)] border border-[var(--border-faint)] bg-[var(--surface-deep)] px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--text-faint)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="text-center py-8 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              No results for &ldquo;{query}&rdquo;
            </p>
          )}

          {navigateItems.length > 0 && (
            <div>
              <p className="px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                Navigate
              </p>
              {navigateItems.map((item) => {
                const globalIdx = filtered.indexOf(item);
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-md)] text-left transition ${
                      globalIdx === activeIndex
                        ? "bg-[var(--brand-soft)] text-[color:var(--text)]"
                        : "text-[color:var(--text-muted)] hover:bg-[var(--surface-deep)] hover:text-[color:var(--text)]"
                    }`}
                    onMouseEnter={() => setActiveIndex(globalIdx)}
                  >
                    <Icon size={16} strokeWidth={2} />
                    <span className="text-[length:var(--t-caption)] font-bold">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {actionItems.length > 0 && (
            <div className={navigateItems.length > 0 ? "mt-2" : ""}>
              <p className="px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                Actions
              </p>
              {actionItems.map((item) => {
                const globalIdx = filtered.indexOf(item);
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--r-md)] text-left transition ${
                      globalIdx === activeIndex
                        ? "bg-[var(--brand-soft)] text-[color:var(--text)]"
                        : "text-[color:var(--text-muted)] hover:bg-[var(--surface-deep)] hover:text-[color:var(--text)]"
                    }`}
                    onMouseEnter={() => setActiveIndex(globalIdx)}
                  >
                    <Icon size={16} strokeWidth={2} />
                    <span className="text-[length:var(--t-caption)] font-bold">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-[var(--border-faint)] px-4 py-2 flex items-center gap-4 text-[10px] text-[color:var(--text-faint)]">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
