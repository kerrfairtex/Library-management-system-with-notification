import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { localRedirectInit } from "@/lib/redirects";

export async function POST() {
  // Relative redirect: the browser resolves "/login" against the address it
  // used. Behind Render's proxy the request URL carries the internal origin
  // (http://localhost:10000), so it must not be used to build the Location.
  // 303 so the browser follows the form POST with a GET.
  const response = new NextResponse(null, localRedirectInit("/login", 303));
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(0),
    maxAge: 0,
  });
  return response;
}
