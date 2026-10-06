import { NextResponse } from "next/server";
import { requireCapability, requireSession } from "@/lib/authz";
import { canAccess } from "@/lib/permissions";
import { updateFine, payFine, forgiveFine, deleteFine } from "@/lib/store";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireCapability(
    "loans.manage",
    "Only librarians and admins can update fines."
  );
  if (!user) return response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { type, amount, amountOutstanding, description, issuedBy, paidAt, action } = body;
    
    // Handle special actions
    if (action === "pay" && amount !== undefined) {
      const fine = await payFine(id, Number(amount));
      if (!fine) return NextResponse.json({ error: "Fine not found." }, { status: 404 });
      return NextResponse.json(fine);
    }
    if (action === "forgive") {
      const fine = await forgiveFine(id);
      if (!fine) return NextResponse.json({ error: "Fine not found." }, { status: 404 });
      return NextResponse.json(fine);
    }

    const fine = await updateFine(id, {
      type: type !== undefined ? String(type) as import("@/lib/types").FineType : undefined,
      amount: amount !== undefined ? Number(amount) : undefined,
      amountOutstanding: amountOutstanding !== undefined ? Number(amountOutstanding) : undefined,
      description: description !== undefined ? (description ? String(description).trim() : null) : undefined,
      issuedBy: issuedBy !== undefined ? (issuedBy ? String(issuedBy).trim() : null) : undefined,
      paidAt: paidAt !== undefined ? (paidAt ? String(paidAt) : null) : undefined,
    });
    if (!fine) return NextResponse.json({ error: "Fine not found." }, { status: 404 });
    return NextResponse.json(fine);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update fine." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireCapability(
    "loans.manage",
    "Only librarians and admins can delete fines."
  );
  if (!user) return response;

  try {
    const { id } = await params;
    const success = await deleteFine(id);
    if (!success) return NextResponse.json({ error: "Fine not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete fine." },
      { status: 500 }
    );
  }
}
