import { NextResponse } from "next/server";
import { createBook, getLibraryData } from "@/lib/store";

export async function GET() {
  const data = await getLibraryData();
  return NextResponse.json(data.books);
}

export async function POST(request: Request) {
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
