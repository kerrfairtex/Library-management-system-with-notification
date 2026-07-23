import { NextResponse } from "next/server";
import { checkoutBook, getLibraryData } from "@/lib/store";
import { enrichLoans } from "@/lib/utils";

export async function GET() {
  const data = await getLibraryData();
  return NextResponse.json(enrichLoans(data.loans, data.books, data.members));
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
