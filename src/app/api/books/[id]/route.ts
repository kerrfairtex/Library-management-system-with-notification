import { NextResponse } from "next/server";
import { deleteBook, updateBook } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const book = await updateBook(id, body);
    if (!book) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }
    return NextResponse.json(book);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update book." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ok = await deleteBook(id);
    if (!ok) {
      return NextResponse.json({ error: "Book not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete book." },
      { status: 400 }
    );
  }
}
