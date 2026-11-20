import { NextResponse } from "next/server";
import { serverError } from "@/lib/server-error";
import { dispatchNotificationEmails, expireStaleHolds, sweepLoanStatuses } from "@/lib/store";
import { cronPolicy } from "@/lib/cron-policy";

/**
 * Stamps overdue loans, sends due-date reminders, and expires ready holds
 * whose pickup window has passed, then e-mails the new member notices
 * (only when RESEND_API_KEY and EMAIL_FROM are set). Scheduled in vercel.json;
 * Vercel calls it with `Authorization: Bearer $CRON_SECRET` whenever that
 * variable is set on the project.
 *
 * This route sits outside the session gate (see src/proxy.ts) because a cron
 * invocation carries no cookie, so CRON_SECRET is the only thing standing in
 * front of it. It therefore refuses to run in production without one.
 */
function authorize(request: Request): NextResponse | null {
  const status = cronPolicy({
    enabled: process.env.CRON_SCHEDULE_ENABLED,
    scheduled: request.headers.get("x-vercel-cron") !== null,
    secret: process.env.CRON_SECRET,
    auth: request.headers.get("authorization"),
  });
  if (status === null) return null;
  const message =
    status === 403
      ? "Loan refresh is disabled for this deployment."
      : status === 503
        ? "CRON_SECRET is not set. Add it to the deployment environment so this endpoint cannot be triggered by anyone."
        : "Unauthorized.";
  if (status >= 500) return serverError("GET/POST /api/cron/refresh-loans", message, { error: message }, status);
  return NextResponse.json({ error: message }, { status });
}

async function run(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  try {
    const result = await sweepLoanStatuses();
    const expiredHolds = await expireStaleHolds();
    // E-mail is best effort: a mail outage or a missing emailed_at column
    // (migration 20261119 not applied) must not fail the circulation sweep.
    let email: Awaited<ReturnType<typeof dispatchNotificationEmails>> | { error: string };
    try {
      email = await dispatchNotificationEmails();
    } catch (err) {
      email = { error: err instanceof Error ? err.message : "E-mail dispatch failed." };
    }
    return NextResponse.json({ ranAt: new Date().toISOString(), ...result, expiredHolds, email });
  } catch (error) {
    return serverError("GET/POST /api/cron/refresh-loans", error, { error: error instanceof Error ? error.message : "Loan sweep failed." }, 500);
  }
}

export async function GET(request: Request) {
  return run(request);
}

/** Lets the sweep be triggered by hand without pretending to be the scheduler. */
export async function POST(request: Request) {
  return run(request);
}
