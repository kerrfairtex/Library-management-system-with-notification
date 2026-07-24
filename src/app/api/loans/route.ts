import { NextResponse } from "next/server";
import { checkoutBook, getLoansData } from "@/lib/store";
import { enrichLoans } from "@/lib/utils";

export async function GET() {
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
  try {
    const body = await request.json();
    const { bookId, memberId, days } = body;
    if (!bookId || !memberId) {
      return NextResponse.json({ error: "bookId and memberId are required." }, { status: 400 });
    }
    const loan = await checkoutBook(bookId, memberId, days ? Number(days) : 14);
    return NextResponse.json(loan, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to checkout book." },
      { status: 400 }
    );
  }
}
