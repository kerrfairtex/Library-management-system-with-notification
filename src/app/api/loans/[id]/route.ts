import { NextResponse } from "next/server";
import { getCirculationSettings } from "@/lib/settings";
import { requireCapability } from "@/lib/authz";
import { renewLoan, returnBook, trapHoldsQuietly } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { user, response } = await requireCapability(
    "loans.manage",
    "Only librarians and admins can update loans."
  );
  if (!user) return response;

  try {
    const { id } = await params;
    const body = await request.json();
    const action = body.action as string;
    if (action === "return") {
      const loan = await returnBook(id);
      // The returned copy goes to the next member in the hold queue.
      await trapHoldsQuietly(loan.bookId);
      return NextResponse.json(loan);
    }
    if (action === "renew") {
      // Server-side clamp (R1): negative extraDays can shorten or re-overdue
      // a loan; NaN produces an Invalid Date RangeError.
      const extraDays =
        body.extraDays === undefined || body.extraDays === null || body.extraDays === ""
          ? 7
          : Number(body.extraDays);
      const { max_renewal_days } = await getCirculationSettings();
      if (!Number.isInteger(extraDays) || extraDays < 1 || extraDays > max_renewal_days) {
        return NextResponse.json(
          { error: `extraDays must be an integer between 1 and ${max_renewal_days}.` },
          { status: 400 }
        );
      }
      const loan = await renewLoan(id, extraDays);
      return NextResponse.json(loan);
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update loan." },
      { status: 400 }
    );
  }
}
