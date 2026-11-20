/** Window event fired after notifications are marked read, so the header bell refreshes. */
export const NOTIFICATIONS_CHANGED = "trac:notifications-changed";

export function announceNotificationsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}
