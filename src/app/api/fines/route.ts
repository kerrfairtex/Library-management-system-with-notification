import { NextRequest, NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/authz";
import { db, supabase } from "@/lib/supabase";

/*
 * Fines API — Koha-style patron accounting.
 *
 * GET    /api/fines              → all fines (staff) or own fines (student)
 * PATCH  /api/fines {id, action} → staff: pay | waive
 */

type FineRow = {
  id: string;
  member_id: string;
  loan_id: string | null;
  type: string;
  amount: string | number;
  amount_outstanding: string | number;
  description: string | null;
  created_at: string;
  paid_at: string | null;
};

export async function GET(request: NextRequest) {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    const url = new URL(request.url);
    const memberId = url.searchParams.get("memberId");

    let query = db(supabase)
      .from("fines")
      .select("*")
      .order("created_at", { ascending: false });

    if (user.role === "student") {
      // Students see only their own fines, matched by email → members row.
      const { data: me } = await db(supabase)
        .from("members")
        .select("id")
        .ilike("email", user.email)
        .maybeSingle();
      if (!me) return NextResponse.json([]);
      query = query.eq("member_id", (me as { id: string }).id);
    } else if (memberId) {
      query = query.eq("member_id", memberId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ fines: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load fines." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireCapability(
    "loans.manage",
    "Only librarians and admins can settle fines."
  );
  if (!user) return response;

  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    const action = String(body.action ?? "");

    if (!id || !["pay", "waive"].includes(action)) {
      return NextResponse.json(
        { error: "id and action ('pay' or 'waive') are required." },
        { status: 400 }
      );
    }

    const patch =
      action === "pay"
        ? { amount_outstanding: 0, paid_at: new Date().toISOString() }
        : { amount_outstanding: 0, description_append: null };

    if (action === "waive") {
      // Waive: zero out and annotate.
      const { data: existing } = await db(supabase)
        .from("fines")
        .select("description")
        .eq("id", id)
        .single();
      const { data, error } = await db(supabase)
        .from("fines")
        .update({
          amount_outstanding: 0,
          paid_at: new Date().toISOString(),
          description:
            ((existing as FineRow | null)?.description ?? "") + " [WAIVED]",
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json(data);
    }

    const { data, error } = await db(supabase)
      .from("fines")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update fine." },
      { status: 500 }
    );
  }
}
