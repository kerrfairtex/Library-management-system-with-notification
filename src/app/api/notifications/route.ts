import { getMemberByUser } from "@/lib/store";
import { serverError } from "@/lib/server-error";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { notificationAudienceFor } from "@/lib/notification-policy";
import {
  getNotificationsData,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationScope,
} from "@/lib/store";
import { sortNotifications } from "@/lib/utils";

export async function GET() {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    const audience = notificationAudienceFor(user.role);
    if (!audience) {
      return NextResponse.json({ error: "Unauthorized notification access." }, { status: 403 });
    }
    let notifications: Awaited<ReturnType<typeof getNotificationsData>>;
    if (audience === "member") {
      const me = await getMemberByUser(user);
      const myMemberId = (me as { id: string } | null)?.id;
      // No member record means nothing is addressed to this account.
      notifications = myMemberId
        ? await getNotificationsData({ kind: "member", memberId: myMemberId })
        : [];
    } else {
      // Staff inbox: staff-addressed alerts plus legacy rows with no recipient.
      notifications = await getNotificationsData({ kind: "staff" });
    }
    return NextResponse.json(sortNotifications(notifications));
  } catch (error) {
    return serverError("GET /api/notifications", error, { error: error instanceof Error ? error.message : "Failed to load notifications." }, 500);
  }
}

export async function PATCH(request: Request) {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    const audience = notificationAudienceFor(user.role);
    if (!audience) {
      return NextResponse.json({ error: "Unauthorized notification access." }, { status: 403 });
    }
    const body = await request.json();
    let scope: NotificationScope | null;
    if (audience === "member") {
      const me = await getMemberByUser(user);
      const memberId = (me as { id: string } | null)?.id;
      scope = memberId ? { kind: "member", memberId } : null;
    } else {
      scope = { kind: "staff" };
    }

    if (body.action === "mark_all_read") {
      const count = scope ? await markAllNotificationsRead(scope) : 0;
      return NextResponse.json({ count });
    }
    if (typeof body.id === "string") {
      const notification = scope ? await markNotificationRead(body.id, scope) : null;
      if (!notification) {
        return NextResponse.json({ error: "Notification not found." }, { status: 404 });
      }
      return NextResponse.json(notification);
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  } catch (error) {
    return serverError("PATCH /api/notifications", error, { error: error instanceof Error ? error.message : "Failed to update notifications." }, 500);
  }
}
