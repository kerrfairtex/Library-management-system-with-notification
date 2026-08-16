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
    const loan = await checkoutBook(bookId, memberId, days ? Number(days) : 7);
    return NextResponse.json(loan, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to checkout book." },
      { status: 400 }
    );
  }
}
