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
        outstandingFines: 0,
        overdueFinesCount: 0,
      };
      // Students see only their own notifications (audience='member' AND recipient_member_id = their id)
      const me = await (await import("@/lib/store")).getMemberByUser(user);
      const myMemberId = (me as { id: string } | null)?.id ?? "";
      const studentNotifications = notifications.filter(
        (n) => n.audience === "member" && n.recipient_member_id === myMemberId
      );
      return NextResponse.json({
        user,
        roleTitle: roleDashboardTitle(user.role),
        stats: {
          ...stats,
          unreadNotifications: studentNotifications.filter((n) => !n.read).length,
        },
        recentLoans: [],
        notifications: sortNotifications(studentNotifications).slice(0, 8),
        books,
        members: [],
      });
    }

    const data = await getLibraryData();
    // Staff see all notifications but filtered by audience
    const staffNotifications = (data.notifications ?? []).filter(
      (n) => n.audience === "staff" || !n.recipient_member_id
    );
    return NextResponse.json({
      user,
      roleTitle: roleDashboardTitle(user.role),
      stats: computeDashboardStats(data),
      recentLoans: enrichLoans(data.loans, data.books, data.members).slice(0, 6),
      notifications: sortNotifications(staffNotifications).slice(0, 8),
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
