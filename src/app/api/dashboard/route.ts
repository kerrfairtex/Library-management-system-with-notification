import { NextResponse } from "next/server";
import { getDashboardStats, getLibraryData } from "@/lib/store";
import { enrichLoans, sortNotifications } from "@/lib/utils";

export async function GET() {
  const [stats, data] = await Promise.all([getDashboardStats(), getLibraryData()]);
  return NextResponse.json({
    stats,
    recentLoans: enrichLoans(data.loans, data.books, data.members).slice(0, 6),
    notifications: sortNotifications(data.notifications).slice(0, 8),
    books: data.books,
    members: data.members,
  });
}
