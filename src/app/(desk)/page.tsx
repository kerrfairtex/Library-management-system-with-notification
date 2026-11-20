"use client";

import type { Book, DashboardStats, Member, Notification, PublicUser } from "@/lib/types";
import { isPatron } from "@/lib/permissions";
import type { EnrichedLoan } from "@/lib/utils";
import { useApi } from "@/lib/hooks";
import { ErrorState, PageHeader } from "@/components/ui";
import { KpiRow, Panel } from "@/components/dashboard/DashboardKit";
import { PatronDashboard } from "@/components/dashboard/PatronDashboard";
import { DeskDashboard } from "@/components/dashboard/DeskDashboard";
import { AdminPanels } from "@/components/dashboard/AdminPanels";

type DashboardResponse = {
  user: PublicUser;
  roleTitle: string;
  stats: DashboardStats;
  recentLoans: EnrichedLoan[];
  notifications: Notification[];
  books: Book[];
  members: Member[];
};

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading dashboard">
      <div>
        <div className="skeleton h-9 w-64 max-w-full" />
        <div className="skeleton mt-2 h-4 w-80 max-w-full" />
      </div>
      <KpiRow items={[]} loading />
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Loading" loading />
        <Panel title="Loading" loading />
      </div>
    </div>
  );
}

/**
 * Home page: one dashboard per role group. Each one fetches only what its
 * role may see; the endpoints enforce the same scope on the server.
 */
export default function DashboardPage() {
  const { data, loading, error, reload } = useApi<DashboardResponse>("/api/dashboard");

  if (loading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <div>
        <PageHeader title="Home" subtitle="Your library at a glance." />
        <ErrorState
          title="Your home page didn’t load"
          message={error || "The dashboard came back empty."}
          onRetry={reload}
        />
        <p className="text-muted text-sm">You can still use the menu to reach every page.</p>
      </div>
    );
  }

  const { notifications, user } = data;
  // Patron home (student, faculty, teacher, community); the API returns no
  // member registry or loan history to these roles.
  const isStudent = isPatron(user);

  if (isStudent) {
    return <PatronDashboard user={user} notifications={notifications} />;
  }

  return (
    <DeskDashboard
      user={user}
      notifications={notifications}
      books={data.books}
      members={data.members}
      adminPanels={user.role === "admin" ? <AdminPanels /> : undefined}
      extraActions={
        user.role === "admin"
          ? [
              { href: "/staff#academic-setup", label: "Academic setup" },
              { href: "/settings", label: "System settings" },
            ]
          : []
      }
    />
  );
}
