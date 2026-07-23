"use client";

import { useMemo, useState } from "react";
import type { Notification } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { formatDate, notificationTone } from "@/lib/utils";
import { EmptyState, ErrorBanner, PageHeader } from "@/components/ui";

export default function NotificationsPage() {
  const { data, loading, error, reload } = useApi<Notification[]>("/api/notifications");
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const notifications = useMemo(() => {
    return (data ?? []).filter((n) => (filter === "unread" ? !n.read : true));
  }, [data, filter]);

  async function markOne(id: string) {
    await apiJson("/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ id }),
    });
    await reload();
  }

  async function markAll() {
    await apiJson("/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    await reload();
  }

  return (
    <div>
      <PageHeader
        title="Alerts"
        subtitle="Overdue loans, due-soon reminders, checkouts, returns, and inventory notices."
        action={
          <button type="button" className="btn btn-primary" onClick={markAll}>
            Mark all read
          </button>
        }
      />

      <div className="panel p-4 md:p-5">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={`btn ${filter === "all" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`btn ${filter === "unread" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter("unread")}
          >
            Unread
          </button>
        </div>

        {error && <ErrorBanner message={error} />}
        {loading && <p className="text-sm">Loading alerts…</p>}

        {!loading && notifications.length === 0 ? (
          <EmptyState
            title="Inbox clear"
            body="No alerts match this filter. New activity will appear here automatically."
          />
        ) : (
          <div className="space-y-3">
            {notifications.map((n, index) => (
              <article
                key={n.id}
                className={`rounded-2xl border border-[var(--line)] px-4 py-4 fade-up ${
                  n.read ? "bg-white/50 opacity-75" : "bg-white"
                }`}
                style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`badge ${notificationTone(n.type)}`}>
                        {n.type.replace("_", " ")}
                      </span>
                      <span className="text-xs text-[color-mix(in_srgb,var(--ink)_45%,transparent)]">
                        {formatDate(n.createdAt)}
                      </span>
                      {!n.read && (
                        <span className="badge tone-info">
                          <span className="pulse-dot mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--info)]" />
                          unread
                        </span>
                      )}
                    </div>
                    <h2 className="display text-xl">{n.title}</h2>
                    <p className="mt-1 text-sm text-[color-mix(in_srgb,var(--ink)_70%,transparent)]">
                      {n.message}
                    </p>
                  </div>
                  {!n.read && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => markOne(n.id)}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
