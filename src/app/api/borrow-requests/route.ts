// Force rebuild: 2026-10-03T09:02:55.455202
import { NextRequest, NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/authz";
import { supabase } from "@/lib/supabase";
import {
  getMemberByEmail,
  getBorrowRequests,
  createBorrowRequest,
  approveBorrowRequest,
  rejectBorrowRequest,
  cancelBorrowRequest,
  checkoutFromBorrowRequest,
  isAccountPending,
} from "@/lib/store";



/*

  Borrow requests API — student self-service request flow + staff approval.

  POST   /api/borrow-requests            student only  create request
  GET    /api/borrow-requests            student: own requests
                                         staff (loans.manage): pending/ready to review
  PATCH  /api/borrow-requests  {id,action}
                                         student: cancel own pending/ready request
                                         staff: approve | reject | checkout

  The request lifecycle lives in the existing holds table with
  kind = 'borrow_request'. Actual checkout still goes through the
  authoritative checkoutBook() / checkout_loan() path.

*/

export async function POST(request: NextRequest) {
  const { user, response: sessionResponse } = await requireSession();
  if (!user) return sessionResponse;

  // Only students may submit borrow requests.
  if (user.role !== "student") {
    return NextResponse.json(
      { error: "Only students can request to borrow books." },
      { status: 403 }
    );
  }

  // The requesting account must be active, not pending approval.
  if (await isAccountPending(user.email)) {
    return NextResponse.json(
      { error: "Your account is awaiting librarian approval." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const bookId = String(body.bookId ?? "");
    if (!bookId) {
      return NextResponse.json(
        { error: "bookId is required." },
        { status: 400 }
      );
    }

    // Resolve the patron record for this student. Never trust a memberId
    // supplied by the caller — derive it from the authenticated session.
    const member = await getMemberByEmail(user.email);
    if (!member) {
      return NextResponse.json(
        { error: "No library membership found for your account." },
        { status: 400 }
      );
    }
    if (!member.active) {
      return NextResponse.json(
        { error: "Your library membership is inactive." },
        { status: 403 }
      );
    }

    // Verify the book exists.
    const { data: bookRow, error: bookLookError } = await supabase
      .from("books")
      .select("id, title, available_copies")
      .eq("id", bookId)
      .maybeSingle();

    if (bookLookError) {
      return NextResponse.json(
        { error: "Failed to look up book." },
        { status: 500 }
      );
    }
    if (!bookRow) {
      return NextResponse.json(
        { error: "Book not found." },
        { status: 404 }
      );
    }

    const hold = await createBorrowRequest(bookId, member.id);

    // Notify the student that the request was submitted.
    await supabase.from("notifications").insert({
      type: "borrow_request_submitted",
      title: "Borrow request submitted",
      message: "You requested \"" + (bookRow.title ?? "the item") + "\". A librarian will review your request.",
      related_id: hold.id,
      read: false,
    });

    return NextResponse.json({ request: hold }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit request." },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { user, response: sessionResponse } = await requireSession();
  if (!user) return sessionResponse;

  try {
    if (user.role === "student") {
      // Students see only their own requests.
      const member = await getMemberByEmail(user.email);
      const requests = member ? await getBorrowRequests(member.id) : [];
      return NextResponse.json({ requests });
    }

    // Staff with loans.manage see pending and approved requests for review.
    const { user: staff, response: staffResponse } = await requireCapability(
      "loans.manage",
      "Only librarians and admins can review borrow requests."
    );
    if (!staff) return staffResponse;

    const requests = await getBorrowRequests();
    return NextResponse.json({ requests });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load requests." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const { user, response: sessionResponse } = await requireSession();
  if (!user) return sessionResponse;

  try {
    const body = await request.json();
    const id = String(body.id ?? "");
    const action = String(body.action ?? "");
    if (!id || !action) {
      return NextResponse.json(
        { error: "id and action are required." },
        { status: 400 }
      );
    }

    // —— Students: may cancel their own pending/ready request. ——
    if (user.role === "student") {
      if (!["cancel"].includes(action)) {
        return NextResponse.json(
          { error: "Students can only cancel their own borrow requests." },
          { status: 403 }
        );
      }
      const member = await getMemberByEmail(user.email);
      if (!member) {
        return NextResponse.json(
          { error: "No library membership found for your account." },
          { status: 400 }
        );
      }
      await cancelBorrowRequest(id, member.id);
      return NextResponse.json({ success: true });
    }

    // —— Staff (loans.manage): approve, reject, or checkout. ——
    const { user: staff, response: staffResponse } = await requireCapability(
      "loans.manage",
      "Only librarians and admins can review borrow requests."
    );
    if (!staff) return staffResponse;

    if (!["approve", "reject", "checkout"].includes(action)) {
      return NextResponse.json(
        { error: "action must be approve, reject, or checkout." },
        { status: 400 }
      );
    }

    if (action === "approve") {
      const hold = await approveBorrowRequest(id, staff.id);
      return NextResponse.json({ request: hold });
    }

    if (action === "reject") {
      const hold = await rejectBorrowRequest(id, staff.id, body.reason);
      return NextResponse.json({ request: hold });
    }

    if (action === "checkout") {
      const days = Number(body.days ?? 14);
      if (!Number.isInteger(days) || days < 1 || days > 60) {
        return NextResponse.json(
          { error: "days must be an integer between 1 and 60." },
          { status: 400 }
        );
      }
      const loan = await checkoutFromBorrowRequest(id, days, staff.id);
      return NextResponse.json({ loan }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update request." },
      { status: 400 }
    );
  }
}
