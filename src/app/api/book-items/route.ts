import { NextResponse } from "next/server";
import { serverError } from "@/lib/server-error";
import { requireCapability } from "@/lib/authz";
import { listBookItemsPage, createBookItem } from "@/lib/store";
import { BOOK_ITEMS_PAGE_SIZE, bookItemsFor, pageCount, pageRange, parseBookItemsQuery } from "@/lib/book-items";
import type { BookItemStatus } from "@/lib/types";

/**
 * GET /api/book-items?bookId=<uuid>&page=<n>
 *   -> { bookId, bookItems, total, available, page, pages, pageSize }
 * One title, one page of BOOK_ITEMS_PAGE_SIZE copies. total/available are
 * that title's counts (HEAD count queries, no rows fetched).
 */
export async function GET(request: Request) {
  const { user, response } = await requireCapability(
    "books.read",
    "Only librarians and admins can view book items."
  );
  if (!user) return response;

  const query = parseBookItemsQuery(new URL(request.url).searchParams);
  if (!query.ok) return NextResponse.json({ error: query.error }, { status: 400 });

  try {
    const { items, total, available } = await listBookItemsPage(query.bookId, pageRange(query.page));
    // Staff notes are private: only catalog editors (books.write) get them.
    return NextResponse.json({
      bookId: query.bookId,
      bookItems: bookItemsFor(user, items),
      total,
      available,
      page: query.page,
      pages: pageCount(total),
      pageSize: BOOK_ITEMS_PAGE_SIZE,
    });
  } catch (error) {
    return serverError("GET /api/book-items", error, { error: error instanceof Error ? error.message : "Failed to load book items." }, 500);
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireCapability(
    "books.write",
    "Only librarians and admins can add book items."
  );
  if (!user) return response;

  try {
    const body = await request.json();
    const { bookId, barcode, status, callNumber, shelfLocation, homeBranch, holdingBranch, notes } = body;
    if (!bookId || !barcode || !status || !homeBranch || !holdingBranch) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    const item = await createBookItem({
      bookId: String(bookId).trim(),
      barcode: String(barcode).trim(),
      status: String(status) as BookItemStatus,
      callNumber: callNumber ? String(callNumber).trim() : null,
      shelfLocation: shelfLocation ? String(shelfLocation).trim() : null,
      homeBranch: String(homeBranch).trim(),
      holdingBranch: String(holdingBranch).trim(),
      notes: notes ? String(notes).trim() : null,
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return serverError("POST /api/book-items", error, { error: error instanceof Error ? error.message : "Failed to create book item." }, 500);
  }
}
