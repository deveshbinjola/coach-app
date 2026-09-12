"use client";

// Top header: logo, primary nav, account dropdown.
//
// Nav design:
//   - Pill-style buttons with real padding (~24px-tall click targets) so
//     touch + mouse both hit reliably. Plain-text links from the v1 nav
//     had ~16px hit zones, which was the "sometimes it doesn't click"
//     complaint.
//   - Active route lights up green via usePathname(). It was previously
//     hardcoded to "Command center" regardless of the actual page, which
//     made the nav lie about where you were.
//   - Logo is the same green-leaf-in-rounded-square the favicon uses,
//     keeping brand consistency across coach-app, the marketing site,
//     and emails.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import BrandLogo from "@/components/BrandLogo";
import type { NavUnlocks } from "@/lib/nav-unlocks";
import { PRIMARY_NAV, MORE_NAV } from "@/lib/nav-items";

// Turn an email into a friendly display name when we don't have a real one
// from user_metadata.
function toDisplayName(email: string, name?: string): string {
  if (name && name.trim()) return name.trim();
  if (!email) return "there";
  const prefix = email.split("@")[0] ?? "";
  const cleaned = prefix.replace(/[._\-+]+/g, " ").trim();
  if (!cleaned) return "there";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

// Primary navigation items. The product should feel like three rooms:
// what to do now, who to work, and the voice asset everything runs through.
//
// Compose was its own top-nav item until 2026-04-27. Removing it shrunk
// nav from 5 to 4, and made Compose feel like what it actually is: an
// action ON your book, not a parallel app.
// Brand OS lives on /voice (it's voice tooling) + standalone /brand-os
// for the $7 public funnel. Removed from main nav 2026-05-13 — coaches
// access it via the Voice page CTA card after Brand OS MVP completes.
// P0 One Surface (roadmap/p0-one-surface.md, slice 4): the primary row is
// the daily loop only — Brief (Home), Queue, and the people rooms. Voice,
// Content, and Automations still exist, one click away under "More"; they
// are hidden from the primary eye-line, not removed, so this is fully
// reversible by moving an entry back up.

type Props = {
  email: string;
  /** Preferred: full name from auth user_metadata. Falls back to email prefix. */
  name?: string;
  /** Google/Supabase profile image. Falls back to initials if unavailable. */
  avatarUrl?: string;
  /** Surface emphasis from onboarding answers. Items that match a "quieter"
   *  surface get dimmer styling without being hidden. */
  emphasis?: { content?: boolean; leads?: boolean; clients?: boolean };
  /** Controls which optional nav items are visible. When undefined, all items show. */
  navUnlocks?: NavUnlocks;
};

export default function Header({ email, name, avatarUrl, emphasis, navUnlocks }: Props) {
  // Map nav href → emphasis flag. Unmapped items (Home, Voice) always
  // stay emphasized — they're foundational, not user-toggleable.
  const isQuiet = (href: string): boolean => {
    if (!emphasis) return false;
    if (href === "/inbox")   return emphasis.leads === false;
    if (href === "/clients") return emphasis.clients === false;
    if (href === "/content") return emphasis.content === false;
    return false;
  };
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem("visited-tabs") ?? "[]"));
    } catch {
      return new Set();
    }
  });

  function markTabVisited(href: string) {
    setVisitedTabs((prev) => {
      const next = new Set(prev);
      next.add(href);
      localStorage.setItem("visited-tabs", JSON.stringify([...next]));
      return next;
    });
  }

  // Close dropdowns (account + More) on outside click or Escape.
  useEffect(() => {
    if (!menuOpen && !moreOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, moreOpen]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const displayName = toDisplayName(email, name);
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  const showAvatar = !!avatarUrl && !avatarFailed;

  const visibleMoreItems = MORE_NAV.filter((item) => {
    if (!navUnlocks) return true;
    if (item.href === "/voice") return navUnlocks.voice;
    if (item.href === "/content") return navUnlocks.content;
    return true;
  });

  /** Active = exact path match, OR current path is a sub-route of the
   *  nav item (so /leads/123 doesn't activate /inbox unless we want it
   *  to. It currently doesn't, since /leads is its own tree). */
  function isActive(href: string): boolean {
    if (pathname === href) return true;
    if (href === "/inbox" && pathname.startsWith("/leads")) return true;
    return pathname.startsWith(href + "/");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-faint)] bg-[color-mix(in_srgb,var(--surface-elevated)_92%,transparent)] backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        {/* Logo + wordmark: same leaf-in-rounded-square as favicon for brand
            consistency across coach-app + marketing site + emails. */}
        <a
          href="/command-center"
          className="flex min-h-11 items-center gap-2.5 shrink-0 rounded-[var(--r-md)] px-1.5 -ml-1.5 transition hover:bg-[var(--surface-deep)] hover:opacity-90 focus-visible:shadow-[var(--shadow-glow)] min-w-0"
          aria-label="Coach Assistant Home"
        >
          <BrandLogo iconSize={32} productLabel="Coach Assistant" />
        </a>

        {/* Desktop nav: pill buttons, route-aware active state */}
        <nav
          className="hidden md:flex items-center gap-1 rounded-[var(--r-pill)] border border-[var(--border-faint)] bg-[var(--surface-deep)] p-1 text-[length:var(--t-caption)]"
          aria-label="Primary navigation"
        >
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(item.href)}
              quiet={isQuiet(item.href)}
              onNavigate={() => markTabVisited(item.href)}
            />
          ))}
          {visibleMoreItems.length > 0 && (
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className={`flex h-10 items-center gap-1 px-4 rounded-[var(--r-pill)] text-[length:var(--t-caption)] font-bold transition ${
                  visibleMoreItems.some((i) => isActive(i.href))
                    ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--border)]"
                    : "text-[color:var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-elevated)_70%,transparent)] hover:text-[color:var(--text)]"
                }`}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                aria-label="More sections"
              >
                More
                <ChevronDown
                  size={13}
                  strokeWidth={2.4}
                  className={`transition-transform ${moreOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {moreOpen && (
                <div
                  role="menu"
                  className="absolute left-0 mt-2 w-44 bg-[var(--surface-elevated)] rounded-[var(--r-lg)] border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden z-50 p-1.5"
                >
                  {visibleMoreItems.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      onClick={() => {
                        markTabVisited(item.href);
                        setMoreOpen(false);
                      }}
                      className={`flex items-center gap-1.5 px-3 h-11 rounded-[var(--r-md)] text-[length:var(--t-caption)] font-bold ${
                        isActive(item.href)
                          ? "bg-[var(--surface-deep)] text-[color:var(--text)]"
                          : "text-[color:var(--text-muted)] hover:bg-[var(--surface-deep)] hover:text-[color:var(--text)]"
                      } ${isQuiet(item.href) && !isActive(item.href) ? "opacity-50 hover:opacity-100" : ""}`}
                      aria-current={isActive(item.href) ? "page" : undefined}
                    >
                      {item.label}
                      {navUnlocks !== undefined &&
                        !visitedTabs.has(item.href) &&
                        (item.href === "/voice" || item.href === "/content") && (
                          <span className="inline-flex items-center rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[length:var(--t-micro)] font-extrabold text-[var(--brand-strong)]">
                            NEW
                          </span>
                        )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* Right side: account dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Account dropdown: 44px tap target on mobile (avatar alone) */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className={`flex items-center gap-2 pl-1.5 pr-3 h-11 rounded-[var(--r-pill)] border shadow-[var(--shadow-sm)] transition ${
                menuOpen
                  ? "bg-[var(--navy)] text-[color:var(--text-inverse)] border-[var(--navy)]"
                  : "bg-[var(--surface-elevated)] text-[color:var(--text)] border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)]"
              }`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Account menu"
            >
              {showAvatar ? (
                <img
                  src={avatarUrl}
                  alt=""
                  width={32}
                  height={32}
                  className={`h-8 w-8 rounded-full object-cover ring-1 ${
                    menuOpen
                      ? "ring-[color-mix(in_srgb,var(--brand)_50%,transparent)]"
                      : "ring-[var(--border)]"
                  }`}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <span
                  className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-[length:var(--t-label)] font-bold ${
                    menuOpen
                      ? "bg-[var(--brand)] text-[color:var(--text-inverse)]"
                      : "bg-[var(--navy)] text-[color:var(--brand-bright)]"
                  }`}
                >
                  {initials || "•"}
                </span>
              )}
              <span className="hidden sm:flex items-baseline gap-1 text-[length:var(--t-caption)] font-bold">
                <span
                  className={`${
                    menuOpen ? "text-[color:var(--text-faint)]" : "text-[color:var(--text-muted)]"
                  } font-normal`}
                >
                  Hello,
                </span>
                <span>{displayName}</span>
              </span>
              <ChevronDown
                size={14}
                strokeWidth={2.4}
                className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-72 bg-[var(--surface-elevated)] rounded-[var(--r-lg)] border border-[var(--border)] shadow-[var(--shadow-lg)] overflow-hidden z-50"
              >
                <div className="flex items-center gap-3 px-3 py-3 border-b border-[var(--border-faint)] bg-[linear-gradient(180deg,var(--surface-deep),var(--surface-elevated))]">
                  {showAvatar ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      width={42}
                      height={42}
                      className="h-[42px] w-[42px] rounded-full object-cover ring-1 ring-[var(--border)]"
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarFailed(true)}
                    />
                  ) : (
                    <span className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[var(--navy)] text-[color:var(--brand-bright)] text-[length:var(--t-caption)] font-extrabold">
                      {initials || "•"}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
                      {displayName}
                    </div>
                    <div
                      className="truncate text-[length:var(--t-caption)] text-[color:var(--text-muted)]"
                      title={email}
                    >
                      {email || "Signed in"}
                    </div>
                  </div>
                </div>
                <div className="p-1.5">
                  <a
                    href="/settings"
                    className="flex items-center gap-2.5 px-3 h-11 rounded-[var(--r-md)] text-[length:var(--t-caption)] hover:bg-[var(--surface-deep)] font-bold text-[color:var(--text)]"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Settings size={15} strokeWidth={2.2} aria-hidden />
                    Settings
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                    className="w-full flex items-center gap-2.5 text-left px-3 h-11 rounded-[var(--r-md)] text-[length:var(--t-caption)] hover:bg-[var(--danger-soft)] font-bold text-[color:var(--danger)]"
                    role="menuitem"
                  >
                    <LogOut size={15} strokeWidth={2.2} aria-hidden />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

    </header>
  );
}

// ---------- helpers ----------

function NavLink({
  href,
  label,
  active,
  quiet = false,
  isNew = false,
  onNavigate,
}: {
  href: string;
  label: string;
  active: boolean;
  /** When true, render at reduced opacity — the coach said no to this
   *  surface in onboarding. Never hide, just de-emphasize. */
  quiet?: boolean;
  isNew?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      className={`flex h-10 items-center gap-1.5 px-4 rounded-[var(--r-pill)] text-[length:var(--t-caption)] font-bold transition ${
        active
          ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--border)]"
          : "text-[color:var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-elevated)_70%,transparent)] hover:text-[color:var(--text)]"
      } ${quiet && !active ? "opacity-50 hover:opacity-100" : ""}`}
      aria-current={active ? "page" : undefined}
      title={quiet ? "You marked this quieter in onboarding — change in Settings" : undefined}
    >
      {label}
      {isNew && (
        <span className="inline-flex items-center rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[length:var(--t-micro)] font-extrabold text-[var(--brand-strong)]">
          NEW
        </span>
      )}
    </a>
  );
}
