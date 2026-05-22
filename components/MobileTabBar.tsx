"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Inbox, Users, Mic, PenTool } from "lucide-react";
import type { NavUnlocks } from "@/lib/nav-unlocks";

const TAB_ITEMS = [
  { href: "/command-center", label: "Home",    icon: Home },
  { href: "/inbox",          label: "Leads",   icon: Inbox },
  { href: "/clients",        label: "Clients", icon: Users },
  { href: "/voice",          label: "Voice",   icon: Mic },
  { href: "/content",        label: "Content", icon: PenTool },
] as const;

const GRID_CLASS: Record<number, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

function readNavUnlocksCookie(): NavUnlocks | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/nav-unlocks=([^;]+)/);
  if (!match) return undefined;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as NavUnlocks;
  } catch {
    return undefined;
  }
}

export default function MobileTabBar() {
  const pathname = usePathname() ?? "";
  const [navUnlocks] = useState<NavUnlocks | undefined>(readNavUnlocksCookie);

  const visibleTabs = TAB_ITEMS.filter((item) => {
    if (!navUnlocks) return true;
    if (item.href === "/voice") return navUnlocks.voice;
    if (item.href === "/content") return navUnlocks.content;
    return true;
  });

  function isActive(href: string): boolean {
    if (pathname === href) return true;
    if (href === "/inbox" && pathname.startsWith("/leads")) return true;
    return pathname.startsWith(href + "/");
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-faint)] bg-[color-mix(in_srgb,var(--surface-elevated)_96%,transparent)] backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Mobile navigation"
    >
      <div className={`grid ${GRID_CLASS[visibleTabs.length] ?? "grid-cols-5"} h-16`}>
        {visibleTabs.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-0.5 transition ${
                active
                  ? "text-[color:var(--brand-strong)]"
                  : "text-[color:var(--text-muted)] active:text-[color:var(--text)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-[var(--brand)]" aria-hidden="true" />
              )}
              <span className={`flex items-center justify-center w-8 h-8 rounded-full transition ${
                active ? "bg-[var(--brand-soft)]" : ""
              }`}>
                <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
              </span>
              <span className={`text-[10px] ${active ? "font-extrabold" : "font-bold"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
