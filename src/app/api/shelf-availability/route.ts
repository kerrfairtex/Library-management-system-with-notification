import { NextResponse } from "next/server";
import { serverError } from "@/lib/server-error";
import { listBooks } from "@/lib/store";
import { corsAllowed } from "@/lib/cors-policy";

/*
 * Public availability feed for the 3D bookshelf companion site.
 * GET /api/shelf-availability
 *   -> [{ id, isbn, title, author, genre, available_copies, total_copies }, ...]
 *
 * CORS: only the explicitly configured bookshelf origin may read this feed.
 * No wildcard default: an unconfigured deployment fails closed.
 */
const ALLOWED_ORIGIN = (process.env.SHELF_ALLOWED_ORIGIN ?? "").trim().replace(/\/$/, "");
export const dynamic = "force-dynamic";
export const revalidate = 30;

/**
 * True when the caller is this deployment's own /shelf page. Browsers omit
 * Origin on same-origin GETs, and when they do send it, it matches Host.
 * Same-origin reads need no CORS grant, so they must keep working when
 * SHELF_ALLOWED_ORIGIN is unset — otherwise the bundled /shelf page gets 503.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const policy = corsAllowed(process.env.SHELF_ALLOWED_ORIGIN, request.headers.get("origin"));
  const sameOrigin = isSameOrigin(request);
  if (!policy.configured && !sameOrigin) {
    return serverError("GET /api/shelf-availability", null, { error: "Shelf availability is not configured." }, 503);
  }
  if (policy.configured && !policy.allowed && !sameOrigin) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  }
  try {
    const books = await listBooks();
    return NextResponse.json(
      books.map((b) => ({
        id: b.id,
        isbn: b.isbn,
        title: b.title,
        author: b.author,
        genre: b.genre,
        available_copies: b.availableCopies,
        total_copies: b.totalCopies,
      })),
      {
        headers: {
          // CORS is granted only to the configured shelf origin; same-origin
          // callers need no grant.
          ...(policy.configured && policy.allowed
            ? { "Access-Control-Allow-Origin": ALLOWED_ORIGIN, Vary: "Origin" }
            : {}),
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    return serverError("GET /api/shelf-availability", error, { error: error instanceof Error ? error.message : "Failed to load availability." }, 500);
  }
}

export async function OPTIONS(request: Request) {
  const policy = corsAllowed(process.env.SHELF_ALLOWED_ORIGIN, request.headers.get("origin"));
  if (!policy.configured) {
    return serverError("OPTIONS /api/shelf-availability", "SHELF_ALLOWED_ORIGIN is not configured", { error: "Shelf availability is not configured." }, 503);
  }
  return new NextResponse(null, {
    status: policy.allowed ? 204 : 403,
    headers: {
      "Access-Control-Allow-Origin": policy.responseOrigin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
