import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { authenticateUser } from "@/lib/store";

const LOGIN_MAX_PER_IP = 40;
const LOGIN_MAX_PER_EMAIL = 10;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    // In-memory fixed-window throttling (per lambda instance — see
    // src/lib/rate-limit.ts for the documented limitation).
    const ip = clientIp(request);
    const ipLimit = rateLimit(`login:ip:${ip}`, LOGIN_MAX_PER_IP);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } }
      );
    }
    const emailLimit = rateLimit(
      `login:email:${email.toLowerCase()}`,
      LOGIN_MAX_PER_EMAIL
    );
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts for this account. Try again later." },
        { status: 429, headers: { "Retry-After": String(emailLimit.retryAfterSeconds) } }
      );
    }

    const user = await authenticateUser(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ user });
    response.cookies.set(
      SESSION_COOKIE,
      await createSessionToken(user.id),
      sessionCookieOptions()
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed." },
      { status: 500 }
    );
  }
}
