// lib/nav-items.ts
//
// ONE definition of the app's navigation split, shared by the desktop Header
// and the MobileTabBar.
//
// Why this file exists: the split used to be declared twice — PRIMARY_NAV /
// MORE_NAV in components/Header.tsx and a separate TAB_ITEMS in
// components/MobileTabBar.tsx. When P0 slice 4 demoted Voice/Content/
// Automations behind a "More" disclosure, only the desktop copy changed. The
// mobile bar kept the old list, which meant /queue — one of the two moments
// the whole product is built on — had no navigation entry on a phone at all,
// while the two sections we had just demoted stayed front and centre.
//
// Icons live with the mobile bar (it is the only surface that draws them),
// keyed by href, so this module stays free of component imports.

export type NavItem = { href: string; label: string };

/** The daily loop. Always visible on both surfaces. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/command-center", label: "Home" },
  { href: "/queue", label: "Queue" },
  { href: "/inbox", label: "Leads" },
  { href: "/clients", label: "Clients" },
];

/** Everything else, behind a "More" disclosure on both surfaces. */
export const MORE_NAV: NavItem[] = [
  { href: "/voice", label: "Voice" },
  { href: "/content", label: "Content" },
  { href: "/automations", label: "Automations" },
];
