"use client";

import { useMemo, useState } from "react";
import type { Notification } from "@/lib/types";
import { apiJson, useApi } from "@/lib/hooks";
import { formatDate, notificationTone } from "@/lib/utils";
import { statusLabel } from "@/lib/status-tone";
import { announceNotificationsChanged } from "@/lib/events";
import { Button, ButtonLink, Card, EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { noticeLink } from "@/lib/notices";
import { isPatron } from "@/lib/permissions";
import { useDeskSession } from "@/components/DeskSessionProvider";

// Force dynamic rendering - this page needs session and database access
export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  const { data, loading, error, reload } = useApi<Notification[]>("/api/notifications");
  const { session } = useDeskSession();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const all = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const unread = all.filter((n) => !n.read).length;
  const notifications = useMemo(() => all.filter((n) => (filter === "unread" ? !n.read : true)), [all, filter]);

  async function mark(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setActionError(null);
    try {
      await apiJson("/api/notifications", { method: "PATCH", body: JSON.stringify(body) });
      await reload();
      announceNotificationsChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Due dates, holds, requests and library activity. Each notice links to where you can act on it."
        action={
          <div className="flex flex-wrap gap-2">
          {isPatron(session?.user) && (
            <ButtonLink href="/profile#notifications" variant="ghost">E-mail settings</ButtonLink>
          )}
          <Button
            variant="primary"
            disabled={unread === 0}
            busy={busy === "all"}
            busyLabel="Marking…"
            onClick={() => mark({ action: "mark_all_read" }, "all")}
          >
            Mark all read
          </Button>
          </div>
        }
      />

      <Card>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Show notifications">
          <Button variant={filter === "all" ? "primary" : "ghost"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All
          </Button>
          <Button variant={filter === "unread" ? "primary" : "ghost"} aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>
            Unread{unread ? ` (${unread})` : ""}
          </Button>
        </div>

        {actionError && <ErrorState message={actionError} />}

        {error ? (
          <ErrorState message={error} onRetry={reload} className="mb-0" />
        ) : loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading notifications">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-20 w-full" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
            body="New activity on your loans, holds and the catalog shows up here."
          />
        ) : (
          <ul className="space-y-3">
            {notifications.map((n, index) => (
              <li
                key={n.id}
                className={`fade-up rounded-2xl border border-[var(--line)] px-4 py-4 ${n.read ? "bg-white/50" : "bg-white"}`}
                style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`badge ${notificationTone(n.type)}`}>{statusLabel(n.type)}</span>
                      <span className="text-muted text-xs">{formatDate(n.createdAt)}</span>
                      {!n.read && (
                        <span className="badge tone-info">
                          <span className="pulse-dot mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--info)]" aria-hidden />
                          Unread
                        </span>
                      )}
                    </div>
                    <h2 className={`display text-xl ${n.read ? "text-muted" : ""}`}>{n.title}</h2>
                    <p className="text-muted mt-1 text-sm">{n.message}</p>
                    {(() => {
                      const link = noticeLink(n.type, n.audience);
                      return link ? (
                        <ButtonLink href={link.href} variant="ghost" className="mt-2 -ml-3">
                          {link.label} →
                        </ButtonLink>
                      ) : null;
                    })()}
                  </div>
                  {!n.read && (
                    <Button variant="ghost" busy={busy === n.id} busyLabel="Marking…" onClick={() => mark({ id: n.id }, n.id)}>
                      Mark read
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
