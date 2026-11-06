import { NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/authz";
import { canAccess } from "@/lib/permissions";
import { listFines, getFinesData, createFine, getMemberByEmail } from "@/lib/store";

export async function GET(request: Request) {
  const { user, response } = await requireSession();
  if (!user) return response;

  const url = new URL(request.url);
  const memberId = url.searchParams.get("memberId");

  try {
    if (canAccess(user, "loans.manage")) {
      if (memberId) return NextResponse.json({ fines: await listFines(memberId) });
      return NextResponse.json(await getFinesData());
    }
    if (user.role === "student") {
      const me = await getMemberByEmail(user.email);
      if (!me) return NextResponse.json({ fines: [] });
      return NextResponse.json({ fines: await listFines(me.id) });
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
      type: String(type) as import("@/lib/types").FineType,
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
