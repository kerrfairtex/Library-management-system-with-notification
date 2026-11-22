import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { parseFineThreshold } from "@/lib/fine-block";
import { clientIp, rateLimitAsync as rateLimit } from "@/lib/rate-limit";
import { renewalCheck, renewalErrorForPatron, renewalFineBlock } from "@/lib/renewal";
import { serverError } from "@/lib/server-error";
import { getCirculationSettings } from "@/lib/settings";
import {
  getLoanOwner,
  getMemberByUser,
  getOutstandingFines,
  getRenewalContext,
  getRenewalRule,
  renewLoan,
} from "@/lib/store";
import { isBookId } from "@/lib/title-page";

type Params = { params: Promise<{ id: string }> };

const RENEW_MAX_PER_IP = 30;

/*
 * POST /api/my-loans/:id/renew — a patron renews their OWN loan.
 * The loan must belong to the signed-in member; the length comes from their
 * member type's circulation rule (capped by the max_renewal_days setting),
 * never from the request. renew_loan() then enforces the renewal limit and
 * the holds block in the same transaction as the update.
 */
export async function POST(request: Request, { params }: Params) {
  const { user, response } = await requireSession();
  if (!user) return response;

  const limit = await rateLimit(`renew:ip:${clientIp(request)}`, RENEW_MAX_PER_IP);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const { id } = await params;
  if (!isBookId(id)) {
    return NextResponse.json({ error: "Loan not found." }, { status: 404 });
  }

  try {
    const me = await getMemberByUser(user);
    const loan = await getLoanOwner(id);
    // Someone else's loan reads exactly like a missing one.
    if (!me || !loan || loan.memberId !== me.id) {
      return NextResponse.json({ error: "Loan not found." }, { status: 404 });
    }

    const [rule, settings, context, outstanding] = await Promise.all([
      getRenewalRule(me.memberType),
      getCirculationSettings(),
      getRenewalContext(me.id, [loan.bookId]),
      getOutstandingFines(me.id),
    ]);
    const check = renewalCheck({
      returned: loan.returned,
      renewalsCount: loan.renewalsCount,
      rule,
      waitingHolds: context[loan.bookId]?.waitingHolds ?? 0,
      availableCopies: context[loan.bookId]?.availableCopies ?? 0,
      maxRenewalDays: settings.max_renewal_days,
      fineBlock: renewalFineBlock(outstanding, parseFineThreshold(process.env.FINE_BLOCK_THRESHOLD)),
    });
    if (!check.canRenew) {
      return NextResponse.json({ error: check.reason }, { status: 409 });
    }

    try {
      const renewed = await renewLoan(id, check.extraDays);
      return NextResponse.json({
        loan: { id: renewed.id, dueAt: renewed.dueAt, renewalsCount: renewed.renewalsCount },
        renewalsLeft: Math.max(0, check.renewalsLeft - 1),
      });
    } catch (error) {
      // The database had the last word (e.g. a hold placed a moment ago).
      const message = error instanceof Error ? error.message : "";
      return NextResponse.json({ error: renewalErrorForPatron(message) }, { status: 409 });
    }
  } catch (error) {
    return serverError("POST /api/my-loans/[id]/renew", error, { error: "The loan wasn't renewed. Please try again." }, 500);
  }
}
