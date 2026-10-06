import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz";
import { upsertCirculationRule, deleteCirculationRule, listCirculationRules } from "@/lib/store";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireCapability(
    "staff.manage",
    "Only admins can manage circulation rules."
  );
  if (!user) return response;

  try {
    const { id: memberType } = await params; // Using member_type as the identifier
    const body = await request.json();
    const { loanDays, renewalDays, maxRenewals, maxLoans, finePerDay } = body;
    
    const rule = await upsertCirculationRule({
      memberType: memberType as "student" | "staff" | "community",
      loanDays: loanDays !== undefined ? Number(loanDays) : 14,
      renewalDays: renewalDays !== undefined ? Number(renewalDays) : 7,
      maxRenewals: maxRenewals !== undefined ? Number(maxRenewals) : 2,
      maxLoans: maxLoans !== undefined ? Number(maxLoans) : 3,
      finePerDay: finePerDay !== undefined ? Number(finePerDay) : 0,
    });
    return NextResponse.json(rule);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update circulation rule." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireCapability(
    "staff.manage",
    "Only admins can manage circulation rules."
  );
  if (!user) return response;

  try {
    const { id: memberType } = await params;
    const success = await deleteCirculationRule(memberType as "student" | "staff" | "community");
    if (!success) return NextResponse.json({ error: "Circulation rule not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete circulation rule." },
      { status: 500 }
    );
  }
}
