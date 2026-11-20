import { getMemberByUser } from "@/lib/store";
import { serverError } from "@/lib/server-error";
import { NextRequest, NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/authz";
import { canAccess, isPatron } from "@/lib/permissions";
import { db, supabase } from "@/lib/supabase";

/*
 * Holds (reservations) API — Koha-style holds queue.
 *
 * GET    /api/holds              → queue (staff) or own holds (patron)
 * POST   /api/holds {bookId}     → patron: own hold; staff: hold for memberId
 * PATCH  /api/holds {id, action} → patron: cancel own; staff: cancel | fulfill
 *
 * Patron = student, faculty, teacher or community (isPatron). Anyone who is
 * neither a patron nor holds loans.manage is refused.
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

    if (isPatron(user)) {
      const me = await getMemberByUser(user);
      if (!me) return NextResponse.json({ holds: [] });
      query = query.eq("member_id", (me as { id: string }).id);
    } else if (!canAccess(user, "loans.manage")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ holds: data ?? [] });
  } catch (error) {
    return serverError("GET /api/holds", error, { error: error instanceof Error ? error.message : "Failed to load holds." }, 500);
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

    const patron = isPatron(user);
    if (!patron && !canAccess(user, "loans.manage")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    // Patrons hold for themselves only — never trust a caller-supplied
    // memberId. Staff place holds for the member they name.
    let memberId: string;
    if (patron) {
      const me = await getMemberByUser(user);
      if (!me) {
        return NextResponse.json(
          { error: "No library membership found for your account." },
          { status: 400 }
        );
      }
      if (!me.active) {
        return NextResponse.json(
          { error: "Your library membership is inactive. Please contact the library." },
          { status: 403 }
        );
      }
      memberId = me.id;
    } else {
      memberId = String(body.memberId ?? "").trim();
      if (!memberId) {
        return NextResponse.json(
          { error: "memberId is required for staff placement." },
          { status: 400 }
        );
      }
    }

    // Staff: validate that the target member exists and is active
    if (!patron) {
      const { data: targetMember, error: memberError } = await db(supabase)
        .from("members")
        .select("id, active")
        .eq("id", memberId)
        .maybeSingle();
      if (memberError) throw new Error(memberError.message);
      if (!targetMember) {
        return NextResponse.json(
          { error: "Target member not found." },
          { status: 400 }
        );
      }
      if (!targetMember.active) {
        return NextResponse.json(
          { error: "Target member is inactive." },
          { status: 400 }
        );
      }
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
    return serverError("POST /api/holds", error, { error: error instanceof Error ? error.message : "Failed to place hold." }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  const { user, response } = await requireSession();
  if (!user) return response;

  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    const action = String(body.action ?? "");

    if (!id) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }

    // ── Patrons: may cancel only their own pending/ready hold. ──
    if (isPatron(user)) {
      if (action !== "cancel") {
        return NextResponse.json(
          { error: "You can only cancel your own holds." },
          { status: 403 }
        );
      }
      const me = await getMemberByUser(user);
      if (!me) throw new Error("No library membership found.");
      const memberId = (me as { id: string }).id;
      const { error } = await db(supabase)
        .from("holds")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("member_id", memberId)
        .in("status", ["pending", "ready"]);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true });
    }

    // ── Staff (loans.manage): cancel or fulfill. ──
    const { user: staff, response: staffResponse } = await requireCapability(
      "loans.manage",
      "Only librarians and admins can manage the holds queue."
    );
    if (!staff) return staffResponse;

    if (!["cancel", "fulfill"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'cancel' or 'fulfill'." },
        { status: 400 }
      );
    }

    if (action === "cancel") {
      const { data, error } = await db(supabase)
        .from("holds")
        .update({ status: "cancelled" })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json(data);
    }

    // Fulfill → mark READY for pickup with a 3-day window + notify student.
    // The loan itself is created at desk checkout (physical handover).
    const pickupExpires = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: hold, error } = await db(supabase)
      .from("holds")
      .update({ status: "ready", expires_at: pickupExpires })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const holdRow = hold as { book_id: string; member_id: string };
    const [{ data: book }, { data: member }] = await Promise.all([
      db(supabase).from("books").select("title").eq("id", holdRow.book_id).single(),
      db(supabase).from("members").select("name").eq("id", holdRow.member_id).single(),
    ]);
    const title = (book as { title?: string } | null)?.title ?? "your reserved title";
    const memberName = (member as { name?: string } | null)?.name ?? "";
    await db(supabase).from("notifications").insert({
      type: "hold_ready",
      title: "Hold ready for pickup",
      message:
        `${memberName ? memberName + ": " : ""}"${title}" is ready at the ` +
        `library desk. Please pick it up within 3 days (by ` +
        `${new Date(pickupExpires).toLocaleDateString("en-PH")}).`,
      related_id: holdRow.book_id,
      recipient_member_id: holdRow.member_id,
      audience: "member",
      read: false,
    });

    return NextResponse.json(hold);
  } catch (error) {
    return serverError("PATCH /api/holds", error, { error: error instanceof Error ? error.message : "Failed to update hold." }, 500);
  }
}
