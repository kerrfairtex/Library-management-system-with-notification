import { NextRequest, NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/authz";
import { db, supabase } from "@/lib/supabase";

/*
 * Holds (reservations) API — Koha-style holds queue.
 *
 * GET    /api/holds              → queue (staff) or own holds (student)
 * POST   /api/holds {bookId}     → place a hold (any signed-in user)
 * PATCH  /api/holds {id, action} → cancel | fulfill (staff)
 */

export async function GET(request: NextRequest) {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    let query = db(supabase)
      .from("holds")
      .select("*")
      .in("status", ["pending", "ready"])
      .order("placed_at", { ascending: true });

    if (user.role === "student") {
      const { data: me } = await db(supabase)
        .from("members")
        .select("id")
        .ilike("email", user.email)
        .maybeSingle();
      if (!me) return NextResponse.json({ holds: [] });
      query = query.eq("member_id", (me as { id: string }).id);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ holds: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load holds." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    const body = await request.json();
    const bookId = String(body.bookId ?? "");
    if (!bookId) {
      return NextResponse.json({ error: "bookId is required." }, { status: 400 });
    }

    // Resolve the patron row for this user (students hold for themselves).
    const { data: me } = await db(supabase)
      .from("members")
      .select("id")
      .ilike("email", user.email)
      .maybeSingle();
    if (!me && user.role === "student") {
      return NextResponse.json(
        { error: "No library membership found for your account." },
        { status: 400 }
      );
    }
    const memberId =
      user.role === "student"
        ? (me as { id: string }).id
        : String(body.memberId || (me as { id: string } | null)?.id || "");
    if (!memberId) {
      return NextResponse.json(
        { error: "memberId is required for staff placement." },
        { status: 400 }
      );
    }

    // Priority = end of the pending queue.
    const { count } = await db(supabase)
      .from("holds")
      .select("id", { count: "exact", head: true })
      .eq("book_id", bookId)
      .in("status", ["pending", "ready"]);

    const { data, error } = await db(supabase)
      .from("holds")
      .insert({
        book_id: bookId,
        member_id: memberId,
        priority: (count ?? 0) + 1,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json(
          { error: "You already have an open hold on this title." },
          { status: 409 }
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ hold: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to place hold." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireCapability(
    "loans.manage",
    "Only librarians and admins can manage the holds queue."
  );
  if (!user) return response;

  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    const action = String(body.action ?? "");

    if (!id || !["cancel", "fulfill"].includes(action)) {
      return NextResponse.json(
        { error: "id and action ('cancel' or 'fulfill') are required." },
        { status: 400 }
      );
    }

    const patch =
      action === "cancel" ? { status: "cancelled" } : { status: "fulfilled" };

    const { data, error } = await db(supabase)
      .from("holds")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update hold." },
      { status: 500 }
    );
  }
}
