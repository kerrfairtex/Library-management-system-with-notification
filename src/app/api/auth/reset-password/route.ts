import { NextResponse } from "next/server";
import type { AppCapability } from "@/lib/permissions";
import { requireSession } from "@/lib/authz";
import { canAccess } from "@/lib/permissions";
import { db, supabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const RESET_MAX_PER_IP = 10;

export async function POST(request: Request) {
  const { user, response } = await requireSession();
  if (!user) return response;

  // Only librarians and admins can reset passwords.
  if (!canAccess(user, "members.manage" as AppCapability)) {
    return NextResponse.json(
      { error: "Only librarians and admins can reset passwords." },
      { status: 403 }
    );
  }

  const ipLimit = rateLimit(`reset:ip:${clientIp(request)}`, RESET_MAX_PER_IP);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const email = String((body as { email?: unknown }).email ?? "").trim().toLowerCase();
  const newPassword = String((body as { newPassword?: unknown }).newPassword ?? "");

  if (!email || !newPassword) {
    return NextResponse.json(
      { error: "Email and newPassword are required." },
      { status: 400 }
    );
  }

  if (newPassword.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 }
    );
  }

  const passwordHash = hashPassword(newPassword);

  const { error } = await db(supabase)
    .from("users")
    .update({ password_hash: passwordHash })
    .ilike("email", email);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log a notification for the affected user
  await db(supabase).from("notifications").insert({
    type: "password_reset",
    title: "Password reset",
    message: `Your password was reset by ${user.name || user.email}.`,
    related_id: user.id,
    read: false,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ success: true, message: "Password reset successfully." });
}
