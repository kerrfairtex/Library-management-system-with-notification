/**
 * Hold queue rules that the app shows and checks. The database does the
 * promoting (trap_holds in supabase/migrations/20261124_hold_queue.sql);
 * this module mirrors its ordering so a patron sees the same place in line,
 * and decides whether a copy on the shelf is free to lend or promised to a
 * ready hold. Pure, so it is tested directly.
 */

export type QueueHold = {
  id: string;
  book_id: string;
  member_id: string;
  status: string;
  priority: number;
  placed_at: string;
  suspended_at?: string | null;
};

/** Queue order used by trap_holds: priority, then placed_at, then id. */
export function compareQueue(a: QueueHold, b: QueueHold): number {
  return (
    a.priority - b.priority ||
    a.placed_at.localeCompare(b.placed_at) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Place in line for each pending hold, per title. Paused holds keep their
 * place but do not push anyone back: only unpaused holds ahead count, since
 * those are the ones that will be served first.
 */
export function queuePositions(holds: QueueHold[]): Record<string, number> {
  const byBook = new Map<string, QueueHold[]>();
  for (const h of holds) {
    if (h.status !== "pending") continue;
    const list = byBook.get(h.book_id) ?? [];
    list.push(h);
    byBook.set(h.book_id, list);
  }
  const positions: Record<string, number> = {};
  for (const list of byBook.values()) {
    list.sort(compareQueue);
    let ahead = 0;
    for (const h of list) {
      positions[h.id] = ahead + 1;
      if (!h.suspended_at) ahead += 1;
    }
  }
  return positions;
}

/**
 * Copies on the shelf that staff may lend to `memberId` right now. A ready
 * hold has a copy set aside for its member; it is free only for that member.
 */
export function lendableCopies(input: {
  availableCopies: number;
  readyHoldsForOthers: number;
}): number {
  return Math.max(0, input.availableCopies - Math.max(0, input.readyHoldsForOthers));
}

export function reservedCopyMessage(title: string): string {
  return (
    `Every copy of "${title}" on the shelf is set aside for a member whose hold is ready. ` +
    `Lend it to that member, or wait for another copy to come back.`
  );
}

export type HoldView = {
  label: string;
  tone: "ok" | "warn" | "info" | "neutral";
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
};

/** What My loans shows for one of the patron's holds. */
export function holdView(
  hold: { status: string; suspended_at?: string | null; expires_at?: string | null },
  position: number | undefined,
  formatDate: (iso: string) => string
): HoldView {
  if (hold.status === "ready") {
    return {
      label: hold.expires_at ? `Ready — pick up by ${formatDate(hold.expires_at)}` : "Ready for pickup",
      tone: "ok",
      canPause: false,
      canResume: false,
      canCancel: true,
    };
  }
  if (hold.status === "pending" && hold.suspended_at) {
    return {
      label: position ? `Paused · keeps #${position} in line` : "Paused",
      tone: "neutral",
      canPause: false,
      canResume: true,
      canCancel: true,
    };
  }
  if (hold.status === "pending") {
    return {
      label: position ? `#${position} in line` : "Waiting",
      tone: "warn",
      canPause: true,
      canResume: false,
      canCancel: true,
    };
  }
  return { label: hold.status, tone: "neutral", canPause: false, canResume: false, canCancel: false };
}
