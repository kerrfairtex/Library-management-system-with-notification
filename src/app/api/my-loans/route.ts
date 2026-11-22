import { getMemberByUser } from "@/lib/store";
import { serverError } from "@/lib/server-error";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { db, supabase } from "@/lib/supabase";
import {
  getBorrowRequests,
  getMaxLoansForMemberType,
  getOutstandingFines,
  getRenewalContext,
  getRenewalRule,
} from "@/lib/store";
import { parseFineThreshold } from "@/lib/fine-block";
import { renewalCheck, renewalFineBlock } from "@/lib/renewal";
import { getCirculationSettings } from "@/lib/settings";

/*
 * GET /api/my-loans — self-service view for the signed-in member:
 * their loans, holds, and fines (matched members row by email), plus the
 * loan limit for their OWN member type. Nothing here is chosen by the client.
 */

export async function GET() {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    const me = await getMemberByUser(user);

    if (!me) {
      return NextResponse.json({ loans: [], holds: [], fines: [], loanLimit: null });
    }
    const memberId = (me as { id: string }).id;

    const [loans, holds, borrowRequests, fines, loanLimit] = await Promise.all([
      db(supabase)
        .from("loans")
        .select("*, books(title, author, isbn)")
        .eq("member_id", memberId)
        .order("borrowed_at", { ascending: false }),
      db(supabase)
        .from("holds")
        .select("*, books(title)")
        .eq("member_id", memberId)
        .in("status", ["pending", "ready"])
        .order("placed_at", { ascending: true }),
      getBorrowRequests(memberId),
      db(supabase)
        .from("fines")
        .select("*")
        .eq("member_id", memberId)
        .gt("amount_outstanding", 0)
        .order("created_at", { ascending: false }),
      getMaxLoansForMemberType(me.memberType),
    ]);

    // Whether each open loan can be renewed right now, and why not. The
    // renew endpoint and renew_loan() re-check; this only drives the button.
    const loanRows = (loans.data ?? []) as {
      id: string;
      book_id: string;
      status: string;
      returned_at: string | null;
      renewals_count: number | null;
    }[];
    const openRows = loanRows.filter((l) => !l.returned_at && l.status !== "returned");
    const [rule, settings, context, outstanding] = await Promise.all([
      getRenewalRule(me.memberType),
      getCirculationSettings(),
      getRenewalContext(memberId, openRows.map((l) => l.book_id)),
      openRows.length > 0 ? getOutstandingFines(memberId) : Promise.resolve(0),
    ]);
    const fineBlock = renewalFineBlock(outstanding, parseFineThreshold(process.env.FINE_BLOCK_THRESHOLD));
    const withRenewal = loanRows.map((l) => {
      const returned = Boolean(l.returned_at) || l.status === "returned";
      const check = renewalCheck({
        returned,
        renewalsCount: l.renewals_count ?? 0,
        rule,
        waitingHolds: context[l.book_id]?.waitingHolds ?? 0,
        availableCopies: context[l.book_id]?.availableCopies ?? 0,
        maxRenewalDays: settings.max_renewal_days,
        fineBlock,
      });
      return {
        ...l,
        renewal: returned
          ? null
          : {
              canRenew: check.canRenew,
              reason: check.reason,
              renewalsLeft: check.renewalsLeft,
              maxRenewals: rule.maxRenewals,
              extraDays: check.extraDays,
            },
      };
    });

    return NextResponse.json({
      loans: withRenewal,
      holds: holds.data ?? [],
      borrowRequests: borrowRequests ?? [],
      fines: fines.data ?? [],
      loanLimit,
    });
  } catch (error) {
    return serverError("GET /api/my-loans", error, { error: error instanceof Error ? error.message : "Failed to load your library record." }, 500);
  }
}
