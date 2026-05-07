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
import { ChevronDown, LogOut, Menu, Settings, X } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import BrandLogo from "@/components/BrandLogo";

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
const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: "/command-center", label: "Command" },
  { href: "/inbox", label: "Leads" },
  { href: "/voice", label: "Voice" },
  { href: "/content", label: "Content" },
];

type Props = {
  email: string;
  /** Preferred: full name from auth user_metadata. Falls back to email prefix. */
  name?: string;
  /** Google/Supabase profile image. Falls back to initials if unavailable. */
  avatarUrl?: string;
};

export default function Header({ email, name, avatarUrl }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Close mobile nav when route changes (so tapping a link feels resolved).
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

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
          aria-label="Elevate AI Coach Home"
        >
          <BrandLogo iconSize={32} productLabel="Coach" />
        </a>

        {/* Desktop nav: pill buttons, route-aware active state */}
        <nav
          className="hidden md:flex items-center gap-1 rounded-[var(--r-pill)] border border-[var(--border-faint)] bg-[var(--surface-deep)] p-1 text-[length:var(--t-caption)]"
          aria-label="Primary navigation"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(item.href)}
            />
          ))}
        </nav>

        {/* Right side: mobile menu toggle + account dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile nav toggle (hamburger): 44px tap target */}
          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-deep)] transition"
            aria-label="Toggle navigation"
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X size={17} aria-hidden /> : <Menu size={17} aria-hidden />}
          </button>

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
                      ? "bg-[var(--brand)] text-[color:var(--navy)]"
                      : "bg-[var(--navy)] text-[color:var(--brand)]"
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
                    <span className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[var(--navy)] text-[color:var(--brand)] text-[length:var(--t-caption)] font-extrabold">
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

      {/* Mobile nav drawer: opens below the header bar.
          Each link is 44px tall for proper tap targets. */}
      {mobileNavOpen && (
        <nav
          className="md:hidden border-t border-[var(--border-faint)] bg-[color-mix(in_srgb,var(--surface-elevated)_96%,transparent)] px-3 py-2 space-y-1"
          aria-label="Primary navigation"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 h-11 rounded-[var(--r-md)] text-[length:var(--t-caption)] font-bold transition ${
                isActive(item.href)
                  ? "bg-[var(--brand-soft)] text-[color:var(--text)] ring-1 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]"
                  : "text-[color:var(--text-muted)] hover:bg-[var(--surface-deep)] hover:text-[color:var(--text)]"
              }`}
            >
              <span>{item.label}</span>
              {isActive(item.href) ? (
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-strong)]" aria-hidden />
              ) : null}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

// ---------- helpers ----------

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <a
      href={href}
      className={`flex h-10 items-center px-4 rounded-[var(--r-pill)] text-[length:var(--t-caption)] font-bold transition ${
        active
          ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--border)]"
          : "text-[color:var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-elevated)_70%,transparent)] hover:text-[color:var(--text)]"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </a>
  );
}
