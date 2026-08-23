import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
import { createBook, listBooks } from "@/lib/store";

export async function GET() {
  const { user, response } = await requireCapability(
    "books.read",
    "Only signed-in users can view the catalog."
  );
  if (!user) return response;

  try {
    const books = await listBooks();
    return NextResponse.json(books);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load books." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireCapability(
    "books.write",
    "Only librarians and admins can add books."
  );
  if (!user) return response;

  try {
    const body = await request.json();
    const { title, author, isbn, genre, totalCopies, publishedYear } = body;
    if (!title || !author || !isbn || !genre || !totalCopies || !publishedYear) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    const book = await createBook({
      title: String(title).trim(),
      author: String(author).trim(),
      isbn: String(isbn).trim(),
      genre: String(genre).trim(),
      category: body.category ? String(body.category).trim() : "General",
      shelfLocation: body.shelfLocation ? String(body.shelfLocation).trim() : null,
      callNumber: body.callNumber ? String(body.callNumber).trim() : null,
      totalCopies: Number(totalCopies),
      publishedYear: Number(publishedYear),
    });
    return NextResponse.json(book, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create book." },
      { status: 500 }
    );
  }
}
