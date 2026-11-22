import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, readSession, sessionCookieOptions } from "@/lib/session";
import { revokeSession } from "@/lib/session-store";
import { localRedirectInit } from "@/lib/redirects";

export async function POST() {
  // Revoke the token server-side too, so a copy of the cookie stops working.
  const claims = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (claims) await revokeSession(claims);

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
