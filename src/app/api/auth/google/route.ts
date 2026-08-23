import { randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabase, db } from "@/lib/supabase";
import { describeSupabaseError, isAccountPending } from "@/lib/store";
import {
  googleAccessDeniedMessage,
  isAllowlistConfigured,
  mayProvisionGoogleAccount,
} from "@/lib/google-access";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const GOOGLE_MAX_PER_IP = 20;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const accessToken = String(body.accessToken ?? "");
    if (!accessToken) {
      return NextResponse.json({ error: "Missing access token." }, { status: 400 });
    }

    const ipLimit = rateLimit(`google:ip:${clientIp(request)}`, GOOGLE_MAX_PER_IP);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } }
      );
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData?.user?.email) {
      return NextResponse.json(
        { error: "Could not verify Google account." },
        { status: 401 }
      );
    }

    const email = authData.user.email.toLowerCase();
    const metaName =
      (authData.user.user_metadata?.full_name as string | undefined) ||
      (authData.user.user_metadata?.name as string | undefined);
    // Prefer the real Google display name; never invent a personal name.
    const name = (metaName && metaName.trim()) || email;

    const { data: existing, error: findError } = await db(supabase)
      .from("users")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (findError) {
      return NextResponse.json(
        { error: describeSupabaseError(findError, "Failed to look up user in Supabase.") },
        { status: 500 }
      );
    }

    let userId = existing?.id as string | undefined;

    // Pending accounts cannot sign in until a librarian approves them.
    if (userId && (await isAccountPending(email))) {
      return NextResponse.json(
        { error: "Your account is awaiting librarian approval. Please visit the library desk." },
        { status: 403 }
      );
    }

    if (!userId) {
      // First-time Google users may self sign-up as students unless an
      // allowlist (or GOOGLE_OPEN_SIGNUP=false) blocks them.
      if (!mayProvisionGoogleAccount(email)) {
        return NextResponse.json(
          { error: googleAccessDeniedMessage(email) },
          { status: 403 }
        );
      }

      const row = {
        id: randomUUID(),
        name,
        email,
        password_hash: `google:${randomBytes(24).toString("hex")}`,
        role: "student",
        // Allowlist matches are pre-approved by domain/email policy; open
        // sign-ups land 'pending' until a librarian approves them.
        status: isAllowlistConfigured() ? "active" : "pending",
        created_at: new Date().toISOString(),
      };
      const { data: inserted, error: insertError } = await db(supabase)
        .from("users")
        .insert(row)
        .select("id")
        .single();

      if (insertError || !inserted) {
        return NextResponse.json(
          {
            error: insertError
              ? describeSupabaseError(insertError, "Failed to create account.")
              : "Failed to create account.",
          },
          { status: 500 }
        );
      }
      userId = inserted.id as string;

      // Alert staff: a new signup is awaiting approval in /staff.
      await db(supabase).from("notifications").insert({
        type: "pending_approval",
        title: "Signup awaiting approval",
        message:
          `${name} (${email}) signed up with Google and needs approval. ` +
          `Open Users → approve to activate their membership.`,
        related_id: userId,
        read: false,
        created_at: new Date().toISOString(),
      });
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(
      SESSION_COOKIE,
      await createSessionToken(userId),
      sessionCookieOptions()
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Google sign-in failed." },
      { status: 500 }
    );
  }
}
