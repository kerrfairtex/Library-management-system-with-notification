import { NextResponse } from "next/server";
import { sweepLoanStatuses } from "@/lib/store";

/**
 * Stamps overdue loans and sends due-date reminders. Scheduled in vercel.json;
 * Vercel calls it with `Authorization: Bearer $CRON_SECRET` whenever that
 * variable is set on the project.
 *
 * This route sits outside the session gate (see src/proxy.ts) because a cron
 * invocation carries no cookie, so CRON_SECRET is the only thing standing in
 * front of it. It therefore refuses to run in production without one.
 */
function authorize(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          error:
            "CRON_SECRET is not set. Add it to the deployment environment so " +
            "this endpoint cannot be triggered by anyone.",
        },
        { status: 503 }
      );
    }
    return null;
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

async function run(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;

  try {
    const result = await sweepLoanStatuses();
    return NextResponse.json({ ranAt: new Date().toISOString(), ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Loan sweep failed." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

/** Lets the sweep be triggered by hand without pretending to be the scheduler. */
export async function POST(request: Request) {
  return run(request);
}
