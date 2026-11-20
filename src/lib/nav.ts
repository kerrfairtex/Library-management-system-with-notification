/**
 * Navigation model for the desk shell: one list of sections per role, each
 * link gated by a capability. Pure (no React), so who-sees-what is tested.
 * Icons are lucide names, resolved to components in the shell.
 */
import { canAccess, isPatron, type AppCapability } from "./permissions";
import type { PublicUser } from "./types";

export type NavIcon =
  | "home" | "search" | "book" | "hourglass" | "wallet" | "bell" | "user" | "help" | "info"
  | "exchange" | "checkout" | "checkin" | "loans" | "users" | "chart" | "accounts"
  | "insights" | "settings" | "library";

export type NavLink = { href: string; label: string; icon: NavIcon; capability?: AppCapability; external?: boolean };
export type NavSection = { heading: string; links: NavLink[] };

const PATRON: NavSection[] = [
  {
    heading: "My library",
    links: [
      { href: "/", label: "Home", icon: "home" },
      { href: "/books", label: "Search catalog", icon: "search", capability: "books.read" },
      { href: "/my-loans", label: "My loans", icon: "book" },
      { href: "/holds", label: "My holds", icon: "hourglass" },
      { href: "/fines", label: "My fines", icon: "wallet" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/notifications", label: "Notifications", icon: "bell", capability: "notifications.read" },
      { href: "/profile", label: "My profile", icon: "user" },
    ],
  },
];

const STAFF: NavSection[] = [
  {
    heading: "Desk",
    links: [
      { href: "/", label: "Home", icon: "home" },
      { href: "/circulation/checkout", label: "Check out", icon: "checkout", capability: "loans.manage" },
      { href: "/circulation/checkin", label: "Check in", icon: "checkin", capability: "loans.manage" },
      { href: "/circulation", label: "Circulation", icon: "exchange", capability: "loans.manage" },
      { href: "/loans", label: "Loans", icon: "loans", capability: "loans.manage" },
      { href: "/holds", label: "Holds & requests", icon: "hourglass", capability: "loans.manage" },
      { href: "/fines", label: "Fines", icon: "wallet", capability: "loans.manage" },
    ],
  },
  {
    heading: "Catalog & patrons",
    links: [
      { href: "/books", label: "Catalog", icon: "search", capability: "books.read" },
      { href: "/members", label: "Patrons", icon: "users", capability: "members.read" },
      { href: "/staff", label: "Patron accounts", icon: "accounts", capability: "members.write" },
      { href: "/reports", label: "Reports", icon: "chart", capability: "loans.manage" },
    ],
  },
  {
    heading: "Administration",
    links: [
      { href: "/admin-insights", label: "Insights", icon: "insights", capability: "staff.manage" },
      { href: "/settings", label: "System settings", icon: "settings", capability: "staff.manage" },
    ],
  },
  {
    heading: "Account",
    links: [
      { href: "/notifications", label: "Notifications", icon: "bell", capability: "notifications.read" },
      { href: "/profile", label: "My profile", icon: "user" },
    ],
  },
];

const HELP: NavSection = {
  heading: "Help",
  links: [
    { href: "/user-guidelines", label: "User guidelines", icon: "help" },
    { href: "/about", label: "About & privacy", icon: "info" },
  ],
};

/**
 * Sections for this user: links they can't use are dropped, then empty
 * sections. Admins see "User accounts" (they manage every role) where
 * librarians see "Patron accounts". `shelfOrigin` adds the 3D bookshelf.
 */
export function navSectionsFor(user: PublicUser | null | undefined, shelfOrigin = ""): NavSection[] {
  if (!user) return [HELP];
  const base = isPatron(user) ? PATRON : STAFF;
  const sections = base.map((section) => ({
    heading: section.heading,
    links: section.links
      .filter((l) => !l.capability || canAccess(user, l.capability))
      .map((l) => (l.href === "/staff" && user.role === "admin" ? { ...l, label: "User accounts" } : l)),
  }));
  if (shelfOrigin) {
    sections[0].links.push({ href: shelfOrigin, label: "3D bookshelf", icon: "library", external: true });
  }
  return [...sections, HELP].filter((s) => s.links.length > 0);
}

/**
 * The single link to highlight: the longest href that matches the path, so
 * /circulation/checkout lights "Check out", not "Circulation" as well.
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const match = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
    if (match && (!best || href.length > best.length)) best = href;
  }
  return best;
}
