import { getMemberByUser } from "@/lib/store";
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
    let notifications = await getNotificationsData();
    if (audience === "member") {
      const me = await getMemberByUser(user);
      const myMemberId = (me as { id: string } | null)?.id;
      // No member record means nothing is addressed to this account.
      notifications = myMemberId
        ? notifications.filter(
            (n) => n.audience === "member" && n.recipient_member_id === myMemberId
          )
        : [];
    } else {
      // Staff inbox: staff-addressed alerts plus legacy rows with no recipient.
      notifications = notifications.filter(
        (n) => n.audience === "staff" || !n.recipient_member_id
      );
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update notifications." },
      { status: 500 }
    );
  }
}
