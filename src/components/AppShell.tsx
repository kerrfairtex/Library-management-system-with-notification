"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Notification } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { formatDate, notificationTone } from "@/lib/utils";

const nav = [
  { href: "/", label: "Desk", icon: "◈" },
  { href: "/books", label: "Catalog", icon: "▣" },
  { href: "/members", label: "Members", icon: "◎" },
  { href: "/loans", label: "Circulation", icon: "⇄" },
  { href: "/notifications", label: "Alerts", icon: "✦" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="shell">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-4 md:grid-cols-[240px_1fr] md:px-6 md:py-6">
        <aside className="panel relative h-fit p-4 md:sticky md:top-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            <Link href="/" className="brand text-2xl text-[var(--ink)]">
              Shelfwalk
            </Link>
            <button
              type="button"
              className="btn btn-ghost md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle navigation"
            >
              Menu
            </button>
          </div>
          <p className="mb-5 hidden text-sm text-[color-mix(in_srgb,var(--ink)_60%,transparent)] md:block">
            Circulation desk with live loan alerts.
          </p>
          <nav className={`${menuOpen ? "block" : "hidden"} space-y-1 md:block`}>
            {nav.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${active ? "active" : ""}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-4">
          <TopBar />
          <main className="fade-up">{children}</main>
        </div>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <header className="panel flex items-center justify-between gap-4 px-4 py-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color-mix(in_srgb,var(--ink)_45%,transparent)]">
          Library operations
        </p>
        <p className="text-sm text-[color-mix(in_srgb,var(--ink)_70%,transparent)]">
          Track books, members, loans, and due-date alerts in one place.
        </p>
      </div>
      <NotificationBell />
    </header>
  );
}

function NotificationBell() {
  const { data, reload } = useApi<Notification[]>("/api/notifications");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = data?.filter((n) => !n.read).length ?? 0;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void reload();
    }, 20000);
    return () => window.clearInterval(id);
  }, [reload]);

  async function markAll() {
    await apiJson("/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    await reload();
  }

  async function markOne(id: string) {
    await apiJson("/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ id }),
    });
    await reload();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost relative"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open notifications"
      >
        Alerts
        {unread > 0 && (
          <span className="pulse-dot absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="slide-in absolute right-0 z-40 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[var(--shadow)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <p className="font-semibold">Notifications</p>
            <button type="button" className="text-xs font-semibold text-[var(--jade)]" onClick={markAll}>
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {(data ?? []).slice(0, 8).map((n) => (
              <button
                key={n.id}
                type="button"
                className={`block w-full border-b border-[var(--line)] px-4 py-3 text-left transition hover:bg-[var(--mist)] ${
                  n.read ? "opacity-70" : ""
                }`}
                onClick={() => markOne(n.id)}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className={`badge ${notificationTone(n.type)}`}>{n.type.replace("_", " ")}</span>
                  <span className="text-xs text-[color-mix(in_srgb,var(--ink)_45%,transparent)]">
                    {formatDate(n.createdAt)}
                  </span>
                </div>
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="text-sm text-[color-mix(in_srgb,var(--ink)_70%,transparent)]">{n.message}</p>
              </button>
            ))}
            {!data?.length && (
              <p className="px-4 py-6 text-sm text-[color-mix(in_srgb,var(--ink)_55%,transparent)]">
                No notifications yet.
              </p>
            )}
          </div>
          <Link
            href="/notifications"
            className="block border-t border-[var(--line)] px-4 py-3 text-center text-sm font-semibold text-[var(--jade)]"
            onClick={() => setOpen(false)}
          >
            View all alerts
          </Link>
        </div>
      )}
    </div>
  );
}
