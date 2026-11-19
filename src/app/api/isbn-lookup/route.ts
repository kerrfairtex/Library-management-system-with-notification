import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
import { isValidIsbn, normalizeIsbn, parseOpenLibrary } from "@/lib/isbn";

/**
 * GET /api/isbn-lookup?isbn=9780140449136
 * Copy-cataloging shortcut for the Add book form: fetches title, author,
 * year and subject from Open Library (free, no API key). Only the ISBN is
 * sent; staff-only so the endpoint cannot be used as an open proxy.
 */
export async function GET(request: Request) {
  const { user, response } = await requireCapability(
    "books.write",
    "Only librarians and admins can look up books."
  );
  if (!user) return response;

  const raw = new URL(request.url).searchParams.get("isbn") ?? "";
  const isbn = normalizeIsbn(raw);
  if (!isValidIsbn(isbn)) {
    return NextResponse.json({ error: "Enter a valid 10- or 13-digit ISBN." }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
      {
        headers: { Accept: "application/json", "User-Agent": "TRAC-Library/1.0" },
        signal: AbortSignal.timeout(10_000),
        next: { revalidate: 86_400 },
      }
    );
    if (!res.ok) {
      return NextResponse.json({ error: `Open Library returned HTTP ${res.status}.` }, { status: 502 });
    }
    const meta = parseOpenLibrary(isbn, await res.json());
    if (!meta) {
      return NextResponse.json(
        { error: "No record found for this ISBN. Enter the details by hand." },
        { status: 404 }
      );
    }
    return NextResponse.json(meta);
  } catch {
    return NextResponse.json(
      { error: "Could not reach Open Library. Enter the details by hand." },
      { status: 504 }
    );
  }
}
