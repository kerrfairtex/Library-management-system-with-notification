import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
import { updateBookItem, deleteBookItem, getBookItemNotes } from "@/lib/store";
import type { BookItemStatus } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireCapability(
    "books.write",
    "Only librarians and admins can update book items."
  );
  if (!user) return response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { barcode, status, callNumber, shelfLocation, homeBranch, holdingBranch, notes } = body;
    
    const item = await updateBookItem(id, {
      barcode: barcode !== undefined ? String(barcode).trim() : undefined,
      status: status !== undefined ? String(status) as BookItemStatus : undefined,
      callNumber: callNumber !== undefined ? (callNumber ? String(callNumber).trim() : null) : undefined,
      shelfLocation: shelfLocation !== undefined ? (shelfLocation ? String(shelfLocation).trim() : null) : undefined,
      homeBranch: homeBranch !== undefined ? String(homeBranch).trim() : undefined,
      holdingBranch: holdingBranch !== undefined ? String(holdingBranch).trim() : undefined,
      notes: notes !== undefined ? (notes ? String(notes).trim() : null) : undefined,
    });
    if (!item) return NextResponse.json({ error: "Book item not found." }, { status: 404 });
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update book item." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireCapability(
    "books.write",
    "Only librarians and admins can delete book items."
  );
  if (!user) return response;

  try {
    const { id } = await params;
    const success = await deleteBookItem(id);
    if (!success) return NextResponse.json({ error: "Book item not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete book item." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireCapability(
    "books.write",
    "Only librarians and admins can view book item notes."
  );
  if (!user) return response;

  try {
    const { id } = await params;
    const url = new URL(request.url);
    const barcode = url.searchParams.get("barcode");
    if (!barcode) {
      return NextResponse.json({ error: "barcode query parameter required." }, { status: 400 });
    }
    const notes = await getBookItemNotes(barcode);
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get book item notes." },
      { status: 500 }
    );
  }
}
