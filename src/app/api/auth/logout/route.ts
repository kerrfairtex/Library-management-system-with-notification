import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function POST() {
  const response = NextResponse.redirect(new URL("/shelf", process.env.NEXT_PUBLIC_SITE_URL || "https://library-cp22.onrender.com"));
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(0),
    maxAge: 0,
  });
  return response;
}
