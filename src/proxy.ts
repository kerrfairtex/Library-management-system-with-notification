import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionUserId } from "@/lib/session";

const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/api/auth/login",
  // Public read-only feed for the 3D bookshelf app (copy counts only).
  "/api/shelf-availability",
  "/api/auth/logout",
  "/api/auth/google",
  // Scheduled invocations carry no session cookie. These routes authenticate
  // themselves with CRON_SECRET instead.
  "/api/cron",
];

// Mutating requests must originate from our own site (CSRF defense).
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients (curl, cron) send no Origin
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CSRF guard: reject cross-origin browser mutations before anything runs.
  if (
    MUTATING_METHODS.has(request.method) &&
    pathname.startsWith("/api/") &&
    !sameOrigin(request)
  ) {
    return NextResponse.json(
      { error: "Cross-origin request rejected." },
      { status: 403 }
    );
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const userId = await readSessionUserId(token);

  if (!userId && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (userId && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
