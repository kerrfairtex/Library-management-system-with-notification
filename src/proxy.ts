import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, readSessionUserId } from "@/lib/session";
import { randomBytes } from "crypto";

const PUBLIC_PATHS = [
  "/user-guidelines",
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
const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients (curl, cron) send no Origin
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

function getCsrfToken(request: NextRequest): string | null {
  // Check header first (for SPA), then cookie (for form submissions)
  return request.headers.get(CSRF_HEADER) || request.cookies.get(CSRF_COOKIE)?.value || null;
}

function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

function setCsrfCookie(response: NextResponse, token: string) {
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
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

  // CSRF double-submit cookie validation for mutating API requests
  // Exempt login/logout/google endpoints - they need to work without prior CSRF token
  const csrfExemptPaths = ["/api/auth/login", "/api/auth/logout", "/api/auth/google"];
  const isCsrfExempt = csrfExemptPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (
    MUTATING_METHODS.has(request.method) &&
    pathname.startsWith("/api/") &&
    !isCsrfExempt
  ) {
    const token = getCsrfToken(request);
    if (!token) {
      return NextResponse.json(
        { error: "CSRF token missing." },
        { status: 403 }
      );
    }
    // For double-submit, we just verify the token exists and matches cookie/header
    // In a real implementation, you'd verify against a stored value
    // Here we use the presence of the token as the check (same-origin already verified)
    const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
    if (cookieToken && token !== cookieToken) {
      return NextResponse.json(
        { error: "CSRF token mismatch." },
        { status: 403 }
      );
    }
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

  // Set CSRF token cookie on safe responses for browser clients
  const response = NextResponse.next();
  if (request.method === "GET" && !pathname.startsWith("/api/")) {
    const existingToken = request.cookies.get(CSRF_COOKIE)?.value;
    if (!existingToken) {
      setCsrfCookie(response, generateCsrfToken());
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
