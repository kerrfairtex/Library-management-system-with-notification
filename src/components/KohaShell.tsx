"use client";

/*
 * Desk shell for TRAC Library.
 *   - Slim solid header: menu button (<1024px), brand, notifications, account.
 *   - Navigation grouped by role (src/lib/nav.ts), one lucide icon set.
 *     ≥1024px: persistent left sidebar. <1024px: slide-over drawer with a
 *     backdrop that closes on navigation, Esc or backdrop click.
 *   - On phones every table turns into a card list; this shell copies each
 *     column heading into td[data-label] so the CSS can label the values.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BarChart3,
  Bell,
  BookOpen,
  ClipboardList,
  Hourglass,
  Info,
  Library,
  LifeBuoy,
  LineChart,
  LogOut,
  Menu,
  Search,
  Settings,
  Home,
  User,
  UserCog,
  Users,
  Wallet,
  X,
  type LucideProps,
} from "lucide-react";
import { isPatron } from "@/lib/permissions";
import { activeHref, navSectionsFor, type NavIcon, type NavSection } from "@/lib/nav";
import type { Notification } from "@/lib/types";
import { useApi } from "@/lib/hooks";
import { resolveDeploymentOrigin } from "@/lib/deploy-config";
import { useDeskSession } from "./DeskSessionProvider";

// Fail closed: no production fallback. When the origin is missing the link
// is simply not shown; admins see the configuration notice in Settings.
const SHELF_CONFIG = resolveDeploymentOrigin(process.env.NEXT_PUBLIC_SHELF_ORIGIN, "NEXT_PUBLIC_SHELF_ORIGIN");
const SHELF_ORIGIN = SHELF_CONFIG.ok ? SHELF_CONFIG.value : "";

const ICONS: Record<NavIcon, ComponentType<LucideProps>> = {
  home: Home,
  search: Search,
  book: BookOpen,
  hourglass: Hourglass,
  wallet: Wallet,
  bell: Bell,
  user: User,
  help: LifeBuoy,
  info: Info,
  exchange: ArrowLeftRight,
  checkout: ArrowUpFromLine,
  checkin: ArrowDownToLine,
  loans: ClipboardList,
  users: Users,
  chart: BarChart3,
  accounts: UserCog,
  insights: LineChart,
  settings: Settings,
  library: Library,
};

export function KohaShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useDeskSession();
  const user = session?.user;
  // All patron roles (student, faculty, teacher, community) get the
  // self-service navigation; staff get the desk navigation.
  const isStudent = isPatron(user);
  const sections = navSectionsFor(user, SHELF_ORIGIN);

  // The drawer remembers the path it was opened on, so any navigation (link,
  // back button) closes it without an extra effect.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const closeDrawer = useCallback(() => setDrawerPath(null), []);
  const menuButton = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useTableCardLabels(mainRef);

  return (
    <div className="desk-shell">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="desk-header">
        <button
          ref={menuButton}
          type="button"
          className="desk-icon-btn desk-menu-btn"
          onClick={() => setDrawerPath(pathname)}
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          aria-controls="desk-drawer"
        >
          <Menu size={22} aria-hidden />
        </button>
        <Link href="/" className="desk-brand">
          <Image src="/branding/trac-library-seal.jpg" alt="" width={30} height={30} priority />
          <span>
            TRAC <span className="desk-brand-sub">Library</span>
          </span>
        </Link>
        <div className="desk-header-actions">
          {user && <NotificationBell />}
          <AccountMenu name={user?.name} signedIn={Boolean(user)} />
        </div>
      </header>

      <div className="desk-body">
        <aside className="desk-sidebar" aria-label={isStudent ? "My library" : "Desk navigation"}>
          <NavList sections={sections} pathname={pathname} />
        </aside>

        {drawerOpen && (
          <Drawer onClose={closeDrawer} returnFocusTo={menuButton}>
            <NavList sections={sections} pathname={pathname} onNavigate={closeDrawer} />
          </Drawer>
        )}

        <div className="desk-content">
          <main id="main" ref={mainRef} className="desk-main" tabIndex={-1}>
            {children}
          </main>
          <footer className="desk-footer">
            <p>TRAC Library · Institute of Agricultural Sciences, Bongao, Tawi-Tawi</p>
            <nav aria-label="About and privacy">
              <Link href="/about">About</Link>
              <Link href="/about#privacy">Privacy policy</Link>
            </nav>
            <p className="mt-1">© {new Date().getFullYear()} TRAC Library</p>
          </footer>
        </div>
      </div>
    </div>
  );
}

function NavList({
  sections,
  pathname,
  onNavigate,
}: {
  sections: NavSection[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const current = activeHref(
    pathname,
    sections.flatMap((s) => s.links.filter((l) => !l.external).map((l) => l.href))
  );
  return (
    <nav className="desk-nav">
      {sections.map((section) => (
        <div key={section.heading} className="desk-nav-section">
          <p className="desk-nav-heading" id={`nav-${section.heading}`}>{section.heading}</p>
          <ul aria-labelledby={`nav-${section.heading}`}>
            {section.links.map((link) => {
              const Icon = ICONS[link.icon];
              const content = (
                <>
                  <Icon size={18} strokeWidth={1.9} aria-hidden />
                  <span>{link.label}</span>
                </>
              );
              return (
                <li key={link.href}>
                  {link.external ? (
                    <a href={link.href} target="_blank" rel="noreferrer noopener" className="desk-nav-link" onClick={onNavigate}>
                      {content}
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="desk-nav-link"
                      aria-current={current === link.href ? "page" : undefined}
                      onClick={onNavigate}
                    >
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Slide-over drawer: backdrop, Esc to close, focus kept inside, focus restored. */
function Drawer({
  children,
  onClose,
  returnFocusTo,
}: {
  children: React.ReactNode;
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = returnFocusTo.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("button, a")?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>("a[href], button");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [onClose, returnFocusTo]);

  return (
    <>
      <div className="desk-drawer-backdrop" onClick={onClose} aria-hidden />
      <div ref={panel} id="desk-drawer" className="desk-drawer" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="desk-drawer-head">
          <span className="font-semibold">Menu</span>
          <button type="button" className="desk-icon-btn" onClick={onClose} aria-label="Close menu">
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/** A popover that closes on outside click, Esc, or navigation. */
function usePopover() {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = useCallback(
    (next: boolean | ((was: boolean) => boolean)) =>
      setOpenPath((current) => {
        const was = current === pathname;
        return (typeof next === "function" ? next(was) : next) ? pathname : null;
      }),
    [pathname]
  );
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);
  return { open, setOpen, ref };
}

function AccountMenu({ name, signedIn }: { name?: string; signedIn: boolean }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="desk-account-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={signedIn ? `Account menu for ${name}` : "Account"}
      >
        <span className="desk-avatar" aria-hidden>{(name ?? "?").slice(0, 1).toUpperCase()}</span>
        <span className="desk-account-name hidden sm:inline">{name ?? "Sign in"}</span>
      </button>
      {open && (
        <div className="desk-popover" role="menu">
          {signedIn ? (
            <>
              <Link href="/profile" className="desk-popover-item" role="menuitem">
                <User size={16} aria-hidden /> My profile
              </Link>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="desk-popover-item danger" role="menuitem">
                  <LogOut size={16} aria-hidden /> Log out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="desk-popover-item" role="menuitem">Sign in</Link>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const { open, setOpen, ref } = usePopover();
  // GET /api/notifications returns the caller's notifications as an array.
  const { data } = useApi<Notification[]>("/api/notifications");
  const notifications = Array.isArray(data) ? data : [];
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="desk-icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <Bell size={20} aria-hidden />
        {unread > 0 && <span className="desk-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="desk-popover desk-popover-wide">
          {notifications.slice(0, 6).map((n) => (
            <div key={n.id} className={`desk-notif ${!n.read ? "unread" : ""}`}>
              <strong>{n.title}</strong>
              <p>{n.message}</p>
            </div>
          ))}
          {notifications.length === 0 && <p className="desk-notif">No notifications.</p>}
          <Link href="/notifications" className="desk-popover-item justify-center font-semibold text-[var(--jade)]">
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Copies each table's column headings into its cells' data-label so the
 * mobile CSS can show every row as a labelled card. Re-runs when pages
 * render new rows.
 */
function useTableCardLabels(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const label = () => {
      el.querySelectorAll<HTMLTableElement>("table.data-table, table.koha-table").forEach((table) => {
        const headings = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
        table.querySelectorAll("tbody tr").forEach((tr) => {
          Array.from(tr.children).forEach((cell, i) => {
            const text = headings[i] ?? "";
            if (cell.getAttribute("data-label") !== text) cell.setAttribute("data-label", text);
          });
        });
      });
    };
    label();
    const observer = new MutationObserver(label);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [root]);
}
