import { NextResponse } from "next/server";
import {
  getNotificationsData,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/store";
import { sortNotifications } from "@/lib/utils";

export async function GET() {
  try {
    const notifications = await getNotificationsData();
    return NextResponse.json(sortNotifications(notifications));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load notifications." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
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
