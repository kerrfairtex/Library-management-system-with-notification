import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { db, supabase } from "@/lib/supabase";
import {
  getNotificationsData,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/store";
import { sortNotifications } from "@/lib/utils";

export async function GET() {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    let notifications = await getNotificationsData();
    // Students see only notifications relevant to them (matched by member email
    // appearing in the message or their member id in related metadata); staff
    // keep the full desk feed.
    if (user.role === "student") {
      const { data: me } = await db(supabase)
        .from("members")
        .select("id, name")
        .ilike("email", user.email)
        .maybeSingle();
      const myName = (me as { name: string } | null)?.name ?? "";
      notifications = notifications.filter(
        (n) =>
          myName &&
          (n.message.includes(myName) || n.title === "Due soon" ||
            n.title === "Overdue loan" || n.title === "Book checked out" ||
            n.title === "Book returned" || n.title === "Loan renewed")
      );
      notifications = notifications.filter((n) => n.message.includes(myName));
    }
    return NextResponse.json(sortNotifications(notifications));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load notifications." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    const body = await request.json();
    if (body.action === "mark_all_read") {
      const count = await markAllNotificationsRead();
      return NextResponse.json({ count });
    }
    if (body.id) {
      const notification = await markNotificationRead(body.id);
      if (!notification) {
        return NextResponse.json({ error: "Notification not found." }, { status: 404 });
      }
      return NextResponse.json(notification);
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update notifications." },
      { status: 500 }
    );
  }
}
