"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useDhara } from "@/components/dhara/DharaProvider";
import DharaConversation from "@/components/dhara/DharaConversation";

const HIDDEN_PREFIXES = ["/login", "/q/", "/welcome", "/brand-os/trial"];

export default function DharaBar() {
  const { open, setOpen } = useDhara();
  const pathname = usePathname() || "/";
  const hidden = pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen(!open); }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hidden, open, setOpen]);

  if (hidden) return null;

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-[var(--navy)] text-white px-4 py-3 shadow-[var(--shadow-lg)] hover:bg-[var(--navy-soft)] transition"
          aria-label="Open Dhara">
          <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />
          <span className="text-[length:var(--t-caption)] font-extrabold">Dhara</span>
          <span className="text-[10px] font-mono opacity-50">&#8984;J</span>
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative w-full sm:w-[420px] h-[80vh] sm:h-full bg-[var(--surface-elevated)] sm:border-l border-[var(--border)] shadow-[var(--shadow-lg)] rounded-t-[var(--r-xl)] sm:rounded-none flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <DharaConversation onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
