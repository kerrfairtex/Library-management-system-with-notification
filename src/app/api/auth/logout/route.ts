import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function POST(request: Request) {
  // Redirect to the LOGIN page on the request's own origin. This keeps staging
  // in staging and never embeds a production bookshelf URL.
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(new URL("/login", origin));
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(0),
    maxAge: 0,
  });
  return response;
}
