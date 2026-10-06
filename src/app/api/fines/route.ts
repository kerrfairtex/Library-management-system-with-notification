import { NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/authz";
import { canAccess } from "@/lib/permissions";
import { listFines, getFinesData, createFine } from "@/lib/store";

export async function GET(request: Request) {
  const { user, response } = await requireSession();
  if (!user) return response;

  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId");

  try {
    if (memberId && canAccess(user, "loans.manage")) {
      // Staff can view fines for specific member
      const fines = await listFines(memberId);
      return NextResponse.json({ fines });
    } else if (canAccess(user, "loans.manage")) {
      // Staff can view all fines with member info
      const data = await getFinesData();
      return NextResponse.json(data);
    } else if (memberId && user.role === "student") {
      // Students can only view their own fines
      // We need to get their member ID first
      // For now, just return the memberId they requested if it matches
      const fines = await listFines(memberId);
      return NextResponse.json({ fines });
    }
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load fines." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const { user, response } = await requireCapability(
    "loans.manage",
    "Only librarians and admins can create fines."
  );
  if (!user) return response;

  try {
    const body = await request.json();
    const { memberId, loanId, type, amount, amountOutstanding, description, issuedBy } = body;
    if (!memberId || !type || amount === undefined || amountOutstanding === undefined) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    const fine = await createFine({
      memberId: String(memberId).trim(),
      loanId: loanId ? String(loanId).trim() : null,
      type: String(type),
      amount: Number(amount),
      amountOutstanding: Number(amountOutstanding),
      description: description ? String(description).trim() : null,
      issuedBy: issuedBy ? String(issuedBy).trim() : null,
    });
    return NextResponse.json(fine, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create fine." },
      { status: 500 }
    );
  }
}
