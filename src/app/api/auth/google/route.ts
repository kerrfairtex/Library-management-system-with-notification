import { randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { describeSupabaseError } from "@/lib/store";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const accessToken = String(body.accessToken ?? "");
    if (!accessToken) {
      return NextResponse.json({ error: "Missing access token." }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !authData?.user?.email) {
      return NextResponse.json(
        { error: "Could not verify Google account." },
        { status: 401 }
      );
    }

    const email = authData.user.email.toLowerCase();
    const name =
      (authData.user.user_metadata?.full_name as string | undefined) ||
      (authData.user.user_metadata?.name as string | undefined) ||
      email;

    const { data: existing, error: findError } = await supabase
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

    if (!userId) {
      const row = {
        id: randomUUID(),
        name,
        email,
        password_hash: `google:${randomBytes(24).toString("hex")}`,
        role: "librarian",
        created_at: new Date().toISOString(),
      };
      const { data: inserted, error: insertError } = await supabase
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
