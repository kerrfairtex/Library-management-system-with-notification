import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
import { listBookItems, createBookItem } from "@/lib/store";
import type { BookItemStatus } from "@/lib/types";

export async function GET() {
  const { user, response } = await requireCapability(
    "books.read",
    "Only librarians and admins can view book items."
  );
  if (!user) return response;

  try {
    const items = await listBookItems();
    return NextResponse.json({ bookItems: items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load book items." },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create book item." },
      { status: 500 }
    );
  }
}
