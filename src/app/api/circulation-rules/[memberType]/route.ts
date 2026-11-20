import { NextRequest, NextResponse } from "next/server";
import { serverError } from "@/lib/server-error";
import { requireCapability } from "@/lib/authz";
import { upsertCirculationRule, deleteCirculationRule } from "@/lib/store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ memberType: string }> }
) {
  const { user, response } = await requireCapability(
    "staff.manage",
    "Only admins can update circulation rules."
  );
  if (!user) return response;

  try {
    const { memberType } = await params;
    const body = await request.json();
    const { loanDays, renewalDays, maxRenewals, maxLoans, finePerDay } = body;

    const validTypes = ["student", "faculty", "teacher", "staff", "community"];
    if (!validTypes.includes(memberType)) {
      return NextResponse.json({ error: "Invalid memberType." }, { status: 400 });
    }

    const rule = await upsertCirculationRule({
      memberType: memberType as "student" | "faculty" | "teacher" | "staff" | "community",
      loanDays: loanDays !== undefined ? Number(loanDays) : 14,
      renewalDays: renewalDays !== undefined ? Number(renewalDays) : 7,
      maxRenewals: maxRenewals !== undefined ? Number(maxRenewals) : 2,
      maxLoans: maxLoans !== undefined ? Number(maxLoans) : 3,
      finePerDay: finePerDay !== undefined ? Number(finePerDay) : 0,
    });

    return NextResponse.json(rule);
  } catch (error) {
    return serverError("PATCH /api/circulation-rules/[memberType]", error, { error: error instanceof Error ? error.message : "Failed to update circulation rule." }, 500);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ memberType: string }> }
) {
  const { user, response } = await requireCapability(
    "staff.manage",
    "Only admins can delete circulation rules."
  );
  if (!user) return response;

  try {
    const { memberType } = await params;

    const validTypes = ["student", "faculty", "teacher", "staff", "community"];
    if (!validTypes.includes(memberType)) {
      return NextResponse.json({ error: "Invalid memberType." }, { status: 400 });
    }

    const deleted = await deleteCirculationRule(memberType as "student" | "faculty" | "teacher" | "staff" | "community");
    if (!deleted) return NextResponse.json({ error: "Circulation rule not found." }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("DELETE /api/circulation-rules/[memberType]", error, { error: error instanceof Error ? error.message : "Failed to delete circulation rule." }, 500);
  }
}
