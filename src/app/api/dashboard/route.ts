import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { canAccess, roleDashboardTitle } from "@/lib/permissions";
import { computeDashboardStats, getLibraryData, listBooks, getNotificationsData } from "@/lib/store";
import type { DashboardStats } from "@/lib/types";
import { enrichLoans, sortNotifications } from "@/lib/utils";

export async function GET() {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    if (!canAccess(user, "members.read")) {
      // Students see their own-facing snapshot only: catalog stats and the
      // alert feed. The member registry and circulation history are withheld
      // (member PII must not reach student accounts).
      const [books, notifications] = await Promise.all([
        listBooks(),
        getNotificationsData(),
      ]);
      const stats: DashboardStats = {
        totalBooks: books.reduce((sum, b) => sum + b.totalCopies, 0),
        availableBooks: books.reduce((sum, b) => sum + b.availableCopies, 0),
        totalMembers: 0,
        activeLoans: 0,
        overdueLoans: 0,
        unreadNotifications: notifications.filter((n) => !n.read).length,
      };
      return NextResponse.json({
        user,
        roleTitle: roleDashboardTitle(user.role),
        stats,
        recentLoans: [],
        notifications: sortNotifications(notifications).slice(0, 8),
        books,
        members: [],
      });
    }

    const data = await getLibraryData();
    return NextResponse.json({
      user,
      roleTitle: roleDashboardTitle(user.role),
      stats: computeDashboardStats(data),
      recentLoans: enrichLoans(data.loans, data.books, data.members).slice(0, 6),
      notifications: sortNotifications(data.notifications).slice(0, 8),
      books: data.books,
      members: data.members,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load dashboard." },
      { status: 500 }
    );
  }
}
