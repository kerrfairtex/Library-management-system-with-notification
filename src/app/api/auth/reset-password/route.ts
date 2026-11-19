import { NextResponse } from "next/server";
import type { AppCapability } from "@/lib/permissions";
import { requireSession } from "@/lib/authz";
import { canAccess } from "@/lib/permissions";
import { db, supabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth";
import { clientIp, rateLimitAsync as rateLimit } from "@/lib/rate-limit";

const RESET_MAX_PER_IP = 10;

export async function POST(request: Request) {
  const { user, response } = await requireSession();
  if (!user) return response;

  // Only librarians and admins can reset passwords.
  if (!canAccess(user, "staff.manage")) {
    return NextResponse.json(
      { error: "Only admins can reset passwords." },
      { status: 403 }
    );
  }

  const ipLimit = await rateLimit(`reset:ip:${clientIp(request)}`, RESET_MAX_PER_IP);
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

  const { data: targetUser, error } = await db(supabase)
    .from("users")
    .update({ password_hash: passwordHash })
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Password reset failed:", error.message);
    return NextResponse.json({ error: "Password reset failed." }, { status: 500 });
  }
  if (!targetUser) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  // Notify the affected user via their linked member record when present.
  const { data: member } = await db(supabase)
    .from("members").select("id").eq("user_id", (targetUser as { id: string }).id).maybeSingle();
  if (member) {
    await db(supabase).from("notifications").insert({
      type: "password_reset",
      title: "Password reset",
      message: "Your password was reset by library staff.",
      related_id: (member as { id: string }).id,
      audience: "member",
      read: false,
      created_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ success: true, message: "Password reset successfully." });
}
