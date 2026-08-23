import { NextResponse } from "next/server";
import { listBooks } from "@/lib/store";

/*
 * Public availability feed for the 3D bookshelf app.
 * GET /api/shelf-availability
 *   -> [{ isbn, available_copies, total_copies }, ...]
 *
 * CORS: the shelf deploys on its own origin (Vercel), so allow any origin
 * to READ this endpoint. It exposes only copy counts — no patron data.
 */

const ALLOWED_ORIGIN = process.env.SHELF_ALLOWED_ORIGIN ?? "*";

export async function GET() {
  try {
    const books = await listBooks();
    return NextResponse.json(
      books.map((b) => ({
        isbn: b.isbn,
        available_copies: b.availableCopies,
        total_copies: b.totalCopies,
      })),
      {
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load availability." },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
