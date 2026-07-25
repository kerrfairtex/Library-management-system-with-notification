import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { computeDashboardStats, getLibraryData } from "@/lib/store";
import { enrichLoans, sortNotifications } from "@/lib/utils";

export async function GET() {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    const data = await getLibraryData();
    return NextResponse.json({
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
