"use client";

/*
 * Koha-style staff chrome for TRAC Library.
 * Reproduces Koha's intranet layout (GPL-3 structure reference, rebuilt in React):
 *   - Green top navbar (#408540) with brand, module links, search, cart, account
 *   - Breadcrumb sub-header
 *   - Content container below
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { canAccess, type AppCapability } from "@/lib/permissions";
import type { Notification, PublicUser } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { useDeskSession } from "./DeskSessionProvider";

/* Top-nav modules — mirrors Koha's header.inc nav items */
const SHELF_ORIGIN = process.env.NEXT_PUBLIC_SHELF_ORIGIN ?? "https://library-cp22.onrender.com/shelf";

const primaryNav: { href: string; label: string; icon?: string; capability: string; children?: { href: string; label: string; capability: string }[] }[] = [
  { href: "/", label: "Home", capability: "dashboard.read" },
  { 
    href: "/circulation", 
    label: "Circulation", 
    icon: "⇄", 
    capability: "loans.manage",
    children: [
      { href: "/circulation", label: "Overview", capability: "loans.manage" },
      { href: "/circulation/checkout", label: "Check out", capability: "loans.manage" },
      { href: "/circulation/checkin", label: "Check in", capability: "loans.manage" },
    ]
  },
  { href: "/books", label: "Search", icon: "🔍", capability: "books.read" },
  { href: "/members", label: "Patrons", icon: "👤", capability: "members.read" },
  { href: "/reports", label: "Reports", icon: "📊", capability: "dashboard.read" },
] as const;

/* "More" dropdown — mirrors Koha's overflow modules */
const moreNav = [
  { href: "/my-loans", label: "My record" },
  { href: "/about", label: "About & Privacy" },
  { href: "/notifications", label: "Notifications" },
  { href: "/holds", label: "Holds queue", capability: "loans.manage" },
  { href: "/fines", label: "Fines desk", capability: "loans.manage" },
  { href: "/staff", label: "Administration", capability: "staff.manage" },
  { href: "/profile", label: "My profile" },
];

export function KohaShell({ children }: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  // Use the shared session context (seeded with server-side session)
  const { session: sessionData, loading: sessionLoading } = useDeskSession();
  const session = sessionData;
  const user = session?.user;
  const moreRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const can = (cap: string) =>
    canAccess(user, cap as AppCapability);

  return (
    <div className="koha-shell">
      {/* ── Koha green navbar ─────────────────────────────────────── */}
      <header className="koha-topbar">
        <div className="koha-topbar-inner">
          <Link href="/" className="koha-brand">
            <Image src="/brand/trac-logo.png" alt="" width={30} height={30} priority />
            <span>
              <strong>TRAC</strong> <span className="koha-brand-sub">Library</span>
            </span>
          </Link>

          <nav className={`koha-nav ${mobileOpen ? "open" : ""}`}>
            {primaryNav.map((item) => {
              if (!can(item.capability)) return null;
              const hasChildren = item.children && item.children.length > 0;
              const isActive = hasChildren
                ? pathname.startsWith(item.href)
                : item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

              return (
                <div key={item.href} className="koha-nav-item">
                  <Link
                    href={hasChildren ? item.href : item.href}
                    className={`koha-nav-link ${isActive ? "active" : ""}`}
                    onClick={() => {
                      if (!hasChildren) setMobileOpen(false);
                      setOpenSubmenu(openSubmenu === item.href ? null : item.href);
                    }}
                  >
                    {item.icon && (
                      <span className="koha-nav-icon" aria-hidden>
                        {item.icon}
                      </span>
                    )}
                    {item.label}
                    {hasChildren && <span className="koha-nav-chevron">{openSubmenu === item.href ? "▲" : "▼"}</span>}
                  </Link>
                  {hasChildren && openSubmenu === item.href && (
                    <div className="koha-submenu">
                      {item.children!.map((child) => {
                        if (!can(child.capability)) return null;
                        const childActive = pathname === child.href;
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`koha-submenu-item ${childActive ? "active" : ""}`}
                            onClick={() => setMobileOpen(false)}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* More dropdown */}
            <div className="koha-dropdown-wrap" ref={moreRef}>
              <button
                type="button"
                className={`koha-nav-link ${moreOpen ? "active" : ""}`}
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
              >
                <span className="koha-nav-icon" aria-hidden>
                  ☰
                </span>
                More
              </button>
              {moreOpen && (
                <div className="koha-dropdown koha-dropdown-dark">
                  {moreNav.map((item) => {
                    if (item.capability && !can(item.capability)) return null;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="koha-dropdown-item"
                        onClick={() => setMoreOpen(false)}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          <div className="koha-topbar-right">
            <a
              className="koha-shelf-btn"
              href={SHELF_ORIGIN}
              target="_blank"
              rel="noreferrer noopener"
              title="Browse the 3D bookshelf"
            >
              📚 3D Bookshelf
            </a>
            <NotificationBell />
            <div className="koha-dropdown-wrap" ref={accountRef}>
              <button
                type="button"
                className="koha-account-btn"
                onClick={() => setAccountOpen((v) => !v)}
                aria-expanded={accountOpen}
              >
                <span className="koha-avatar" aria-hidden>
                  {(user?.name ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="koha-account-name">{user?.name ?? "Log in"}</span>
                <span aria-hidden>▾</span>
              </button>
              {accountOpen && (
                <div className="koha-dropdown">
                  {user ? (
                    <>
                      <Link href="/profile" className="koha-dropdown-item">
                        My profile
                      </Link>
                      <form action="/api/auth/logout" method="post">
                        <button type="submit" className="koha-dropdown-item koha-danger">
                          Log out
                        </button>
                      </form>
                    </>
                  ) : (
                    <Link href="/login" className="koha-dropdown-item">
                      Sign in
                    </Link>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className="koha-burger md:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle navigation"
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {/* ── Breadcrumb sub-header ─────────────────────────────────── */}
      <div className="koha-subheader">
        <Breadcrumb path={pathname} />
      </div>

      <main className="koha-main">{children}</main>

      <footer className="koha-footer">
        <p className="koha-footer-brand">
          TRAC Library — Library Management System · Institute of Agricultural
          Sciences, Bongao, Tawi-Tawi
        </p>
        <nav className="koha-footer-links" aria-label="About and privacy">
                  <Link href="/about">About</Link>
                  <span aria-hidden>·</span>
                  <Link href="/about#privacy">Privacy Policy</Link>
                  <span aria-hidden>·</span>
                  <a href="tel:+639****0812">0963 713 0812</a>
                </nav>
                <div className="koha-footer-developers">
                  <p className="koha-footer-dev-title">Developers</p>
                  <ul>
                    <li>Aisha W. Daluddin</li>
                    <li>Analyn L. Husain</li>
                    <li>Lowza A. Abdul</li>
                    <li>Dainel M. Al-basri</li>
                    <li>Adzlina A. Sahidjuan</li>
                  </ul>
                </div>
                <p className="koha-footer-fine">
                  © {new Date().getFullYear()} TRAC Library. 3D bookshelf powered by Three.js.
                </p>
      </footer>
    </div>
  );
}

function Breadcrumb({ path }: { path: string }) {
  const parts = path.split("/").filter(Boolean);
  return (
    <ol className="koha-breadcrumbs">
      <li>
        <Link href="/">Home</Link>
      </li>
      {parts.map((part, i) => (
        <li key={i} aria-current={i === parts.length - 1 ? "page" : undefined}>
          {part.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </li>
      ))}
    </ol>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useApi<{ notifications: Notification[] }>("/api/notifications");
  const unread = (data?.notifications ?? []).filter((n) => !n.read).length;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="koha-dropdown-wrap" ref={ref}>
      <button
        type="button"
        className="koha-bell"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        🔔
        {unread > 0 && <span className="koha-badge">{unread}</span>}
      </button>
      {open && (
        <div className="koha-dropdown koha-dropdown-wide">
          {(data?.notifications ?? []).slice(0, 6).map((n) => (
            <div key={n.id} className={`koha-notif ${!n.read ? "unread" : ""}`}>
              <strong>{n.title}</strong>
              <p>{n.message}</p>
            </div>
          ))}
          {(data?.notifications ?? []).length === 0 && (
            <div className="koha-notif">No notifications.</div>
          )}
          <Link href="/notifications" className="koha-dropdown-item all">
            See all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
