"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Inbox, Users, Mic, PenTool } from "lucide-react";

const TAB_ITEMS = [
  { href: "/command-center", label: "Home",    icon: Home },
  { href: "/inbox",          label: "Leads",   icon: Inbox },
  { href: "/clients",        label: "Clients", icon: Users },
  { href: "/voice",          label: "Voice",   icon: Mic },
  { href: "/content",        label: "Content", icon: PenTool },
] as const;

export default function MobileTabBar() {
  const pathname = usePathname() ?? "";

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
      <div className="grid grid-cols-5 h-14">
        {TAB_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 transition ${
                active
                  ? "text-[color:var(--brand-strong)]"
                  : "text-[color:var(--text-muted)] active:text-[color:var(--text)]"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
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
