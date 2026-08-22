import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
import { checkoutBook, getLoansData } from "@/lib/store";
import { enrichLoans } from "@/lib/utils";

export async function GET() {
  const { user, response } = await requireCapability(
    "loans.manage",
    "Only librarians and admins can manage loans."
  );
  if (!user) return response;

  try {
    const { loans, books, members } = await getLoansData();
    return NextResponse.json(enrichLoans(loans, books, members));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load loans." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireCapability(
    "loans.manage",
    "Only librarians and admins can check out books."
  );
  if (!user) return response;

  try {
    const body = await request.json();
    const { bookId, memberId, days } = body;
    if (!bookId || !memberId) {
      return NextResponse.json({ error: "bookId and memberId are required." }, { status: 400 });
    }
    // Server-side clamp (E2): a negative/zero days value creates an
    // already-overdue loan; huge values create absurd due dates. The UI caps
    // 1-60; the API is the trust boundary.
    const loanDays = days === undefined || days === null || days === "" ? 7 : Number(days);
    if (!Number.isInteger(loanDays) || loanDays < 1 || loanDays > 60) {
      return NextResponse.json({ error: "days must be an integer between 1 and 60." }, { status: 400 });
    }
    const loan = await checkoutBook(bookId, memberId, loanDays);
    return NextResponse.json(loan, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to checkout book." },
      { status: 400 }
    );
  }
}
