import { NextRequest, NextResponse } from "next/server";
import { getCirculationSettings } from "@/lib/settings";
import { serverError } from "@/lib/server-error";
import { requireCapability } from "@/lib/authz";
import { checkoutBook, countReadyHoldsForOthers, getBookById, getLoansData, getOutstandingFines } from "@/lib/store";
import { lendableCopies, reservedCopyMessage } from "@/lib/hold-queue";
import { fineBlockMessage, parseFineThreshold } from "@/lib/fine-block";
import { enrichLoans } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const { user, response } = await requireCapability(
    "loans.manage",
    "Only librarians and admins can manage loans."
  );
  if (!user) return response;

  try {
    const url = new URL(request.url);
    // Server-side pagination: ?page=1&pageSize=200 (defaults preserve the
    // full-feed behaviour the desk UI expects, but cap payload size).
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const pageSize = Math.min(1000, Math.max(10, Number(url.searchParams.get("pageSize") ?? 500)));
    const { loans: allLoans, books, members } = await getLoansData();
    const enriched = enrichLoans(allLoans, books, members);
    const total = enriched.length;
    const start = (page - 1) * pageSize;
    const paged = enriched.slice(start, start + pageSize);
    return NextResponse.json({
      data: paged,
      page,
      pageSize,
      total,
      hasMore: start + pageSize < total,
    });
  } catch (error) {
    return serverError("GET /api/loans", error, { error: error instanceof Error ? error.message : "Failed to load loans." }, 500);
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
    // to the admin's max_loan_days setting; the API is the trust boundary.
    const { max_loan_days } = await getCirculationSettings();
    const loanDays = days === undefined || days === null || days === "" ? 7 : Number(days);
    if (!Number.isInteger(loanDays) || loanDays < 1 || loanDays > max_loan_days) {
      return NextResponse.json(
        { error: `days must be an integer between 1 and ${max_loan_days}.` },
        { status: 400 }
      );
    }
    const blocked = fineBlockMessage(
      await getOutstandingFines(memberId),
      parseFineThreshold(process.env.FINE_BLOCK_THRESHOLD)
    );
    if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });
    // Copies set aside for ready holds may only go to those members.
    const [book, readyForOthers] = await Promise.all([
      getBookById(String(bookId)),
      countReadyHoldsForOthers(String(bookId), String(memberId)),
    ]);
    if (book && lendableCopies({ availableCopies: book.availableCopies, readyHoldsForOthers: readyForOthers }) <= 0 && book.availableCopies > 0) {
      return NextResponse.json({ error: reservedCopyMessage(book.title) }, { status: 409 });
    }
    const loan = await checkoutBook(bookId, memberId, loanDays, user.id);
    return NextResponse.json(loan, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to checkout book." },
      { status: 400 }
    );
  }
}
