"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Inbox, Users, Mic, PenTool, ListChecks, Workflow, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { NavUnlocks } from "@/lib/nav-unlocks";
import { PRIMARY_NAV, MORE_NAV } from "@/lib/nav-items";

// Icons live here because this is the only surface that draws them. Keyed by
// href so lib/nav-items.ts stays the single definition of WHICH tabs exist.
const ICONS: Record<string, LucideIcon> = {
  "/command-center": Home,
  "/queue": ListChecks,
  "/inbox": Inbox,
  "/clients": Users,
  "/voice": Mic,
  "/content": PenTool,
  "/automations": Workflow,
};

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

// Public, no-auth surfaces that should not show the app nav (lead magnets etc.).
const HIDDEN_PREFIXES = ["/win", "/meet", "/login"];

export default function MobileTabBar() {
  const pathname = usePathname() ?? "";
  const [navUnlocks] = useState<NavUnlocks | undefined>(readNavUnlocksCookie);
  const [moreOpen, setMoreOpen] = useState(false);

  // Root is the public landing page: no app chrome for signed-out visitors.
  const hidden = pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (hidden) return null;

  // Same unlock rules the Header applies to its More menu.
  const visibleMoreItems = MORE_NAV.filter((item) => {
    if (!navUnlocks) return true;
    if (item.href === "/voice") return navUnlocks.voice;
    if (item.href === "/content") return navUnlocks.content;
    return true;
  });

  // Primary tabs are the daily loop and never fold. "More" only earns a slot
  // when there is something behind it, so a locked account gets four tabs
  // rather than a button that opens an empty sheet.
  const showMore = visibleMoreItems.length > 0;
  const tabCount = PRIMARY_NAV.length + (showMore ? 1 : 0);
  const moreActive = visibleMoreItems.some(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
  );

  function isActive(href: string): boolean {
    if (href === "/queue" && pathname.startsWith("/queue")) return true;
    if (pathname === href) return true;
    if (href === "/inbox" && pathname.startsWith("/leads")) return true;
    return pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* Sheet sits above the bar, not in a modal, so the tab row stays put
          and one tap anywhere dismisses it. */}
      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-40 bg-[color-mix(in_srgb,var(--navy)_28%,transparent)] md:hidden"
          />
          <div
            className="fixed inset-x-3 z-50 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] shadow-[var(--shadow-lg)] overflow-hidden md:hidden"
            style={{ bottom: "calc(4rem + env(safe-area-inset-bottom) + 0.5rem)" }}
            role="menu"
            aria-label="More sections"
          >
            {visibleMoreItems.map((item) => {
              const Icon = ICONS[item.href] ?? MoreHorizontal;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setMoreOpen(false)}
                  className={`flex items-center gap-3 px-4 min-h-14 border-b border-[var(--border-faint)] last:border-b-0 text-[length:var(--t-body)] font-bold transition ${
                    active
                      ? "text-[color:var(--brand-strong)] bg-[var(--brand-soft)]"
                      : "text-[color:var(--text)] active:bg-[var(--surface-deep)]"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={19} strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-faint)] bg-[color-mix(in_srgb,var(--surface-elevated)_96%,transparent)] backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Mobile navigation"
      >
        <div className={`grid ${GRID_CLASS[tabCount] ?? "grid-cols-5"} h-16`}>
          {PRIMARY_NAV.map((item) => {
            const active = isActive(item.href);
            const Icon = ICONS[item.href] ?? MoreHorizontal;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
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

          {showMore && (
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              className={`relative flex flex-col items-center justify-center gap-0.5 transition ${
                moreActive || moreOpen
                  ? "text-[color:var(--brand-strong)]"
                  : "text-[color:var(--text-muted)] active:text-[color:var(--text)]"
              }`}
            >
              {moreActive && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-[var(--brand)]" aria-hidden="true" />
              )}
              <span className={`flex items-center justify-center w-8 h-8 rounded-full transition ${
                moreActive || moreOpen ? "bg-[var(--brand-soft)]" : ""
              }`}>
                <MoreHorizontal size={18} strokeWidth={moreActive ? 2.4 : 1.8} />
              </span>
              <span className={`text-[10px] ${moreActive ? "font-extrabold" : "font-bold"}`}>
                More
              </span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
