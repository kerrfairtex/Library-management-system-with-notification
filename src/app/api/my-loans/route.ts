import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { db, supabase } from "@/lib/supabase";

/*
 * GET /api/my-loans — self-service view for the signed-in member:
 * their loans, holds, and fines (matched members row by email).
 */

export async function GET() {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    const { data: me } = await db(supabase)
      .from("members")
      .select("id")
      .ilike("email", user.email)
      .maybeSingle();

    if (!me) {
      return NextResponse.json({ loans: [], holds: [], fines: [] });
    }
    const memberId = (me as { id: string }).id;

    const [loans, holds, fines] = await Promise.all([
      db(supabase)
        .from("loans")
        .select("*, books(title, author, isbn)")
        .eq("member_id", memberId)
        .order("borrowed_at", { ascending: false }),
      db(supabase)
        .from("holds")
        .select("*, books(title)")
        .eq("member_id", memberId)
        .in("status", ["pending", "ready"])
        .order("placed_at", { ascending: true }),
      db(supabase)
        .from("fines")
        .select("*")
        .eq("member_id", memberId)
        .gt("amount_outstanding", 0)
        .order("created_at", { ascending: false }),
    ]);

    return NextResponse.json({
      loans: loans.data ?? [],
      holds: holds.data ?? [],
      fines: fines.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load your library record." },
      { status: 500 }
    );
  }
}
